-- Front-line, bookable staff (role = 'EMPLOYEE'): the people customers can
-- be assigned to, or select, for a booking. Station managers/managers/owners
-- do NOT get a row here — they're scoped to stations via
-- employee_station_assignments directly against their profile, since they
-- don't take bookings or shifts.
CREATE TABLE public.employees (
  id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  hire_date date,
  bio_en text,
  bio_ar text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce that only EMPLOYEE-role profiles get an employees row, at the
-- database level rather than trusting the app to check this.
CREATE OR REPLACE FUNCTION public.check_employee_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_role public.user_role;
BEGIN
  SELECT role INTO profile_role FROM public.profiles WHERE id = NEW.id;
  IF profile_role IS DISTINCT FROM 'EMPLOYEE' THEN
    RAISE EXCEPTION 'employees.id (%) must reference a profile with role = EMPLOYEE, found %', NEW.id, profile_role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_employee_role
  BEFORE INSERT OR UPDATE OF id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.check_employee_role();

-- ============================================================================
-- employee_station_assignments: which station(s) a staff member (employee OR
-- station manager) belongs to. This is also how STATION_MANAGER's "assigned
-- station(s) only" access rule is scoped in RLS.
-- ============================================================================
CREATE TABLE public.employee_station_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, station_id)
);

CREATE INDEX employee_station_assignments_station_id_idx ON public.employee_station_assignments (station_id);
CREATE INDEX employee_station_assignments_profile_id_idx ON public.employee_station_assignments (profile_id);

-- Only EMPLOYEE / STATION_MANAGER profiles get station assignments —
-- OWNER/MANAGER already have all-station access, CUSTOMER has none.
CREATE OR REPLACE FUNCTION public.check_assignment_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_role public.user_role;
BEGIN
  SELECT role INTO profile_role FROM public.profiles WHERE id = NEW.profile_id;
  IF profile_role NOT IN ('EMPLOYEE', 'STATION_MANAGER') THEN
    RAISE EXCEPTION 'employee_station_assignments.profile_id (%) must reference an EMPLOYEE or STATION_MANAGER profile, found %', NEW.profile_id, profile_role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_assignment_role
  BEFORE INSERT OR UPDATE OF profile_id ON public.employee_station_assignments
  FOR EACH ROW EXECUTE FUNCTION public.check_assignment_role();

-- ============================================================================
-- employee_working_hours: per-employee, per-day-of-week schedule. The
-- booking engine (Phase 6) must never offer a slot outside these hours.
-- ============================================================================
CREATE TABLE public.employee_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  is_24_hours boolean NOT NULL DEFAULT false,
  starts_at time,
  ends_at time,
  break_starts_at time,
  break_ends_at time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week),
  CHECK (public.is_valid_hours_row(is_closed, is_24_hours, starts_at, ends_at)),
  CHECK (
    (break_starts_at IS NULL AND break_ends_at IS NULL)
    OR (break_starts_at IS NOT NULL AND break_ends_at IS NOT NULL AND break_starts_at <> break_ends_at)
  )
);

CREATE INDEX employee_working_hours_employee_id_idx ON public.employee_working_hours (employee_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.employee_working_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- shifts: actual clock-in/clock-out records.
-- ============================================================================
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX shifts_employee_id_idx ON public.shifts (employee_id);
CREATE INDEX shifts_station_id_idx ON public.shifts (station_id);
CREATE INDEX shifts_created_at_idx ON public.shifts (created_at);

-- An employee can only have one active (not yet ended) shift at a time.
CREATE UNIQUE INDEX shifts_one_active_per_employee_idx
  ON public.shifts (employee_id) WHERE ended_at IS NULL;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- customers: customer-specific data, kept separate from profiles as the
-- clean FK target for bookings/feedback/complaints/loyalty.
-- ============================================================================
CREATE TABLE public.customers (
  id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.check_customer_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  profile_role public.user_role;
BEGIN
  SELECT role INTO profile_role FROM public.profiles WHERE id = NEW.id;
  IF profile_role IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'customers.id (%) must reference a profile with role = CUSTOMER, found %', NEW.id, profile_role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_customer_role
  BEFORE INSERT OR UPDATE OF id ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.check_customer_role();
