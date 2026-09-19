-- ============================================================================
-- bookings: the core operational record.
--
-- time_range is a real tstzrange (actual timestamps, timezone-aware), not
-- separate start/end columns and not a time-of-day — this is what lets a
-- 22:00-04:00 car wash booking be stored and compared correctly without any
-- special "crosses midnight" handling: it's just a range that happens to
-- span two calendar days.
--
-- Double-booking prevention (required now, even though the full
-- availability-computation booking ENGINE is built later in Phase 6): the
-- two EXCLUDE constraints below make Postgres itself reject an INSERT/UPDATE
-- that would overlap an existing active booking for the same employee or
-- the same resource/bay. This holds even under concurrent requests — it's
-- not just an application-level check that a race condition could slip past.
-- ============================================================================
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE RESTRICT,
  station_service_id uuid NOT NULL REFERENCES public.station_services (id) ON DELETE RESTRICT,
  resource_id uuid REFERENCES public.service_resources (id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  time_range tstzrange NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'PENDING',
  -- Snapshot of the price at booking time — station_services.price_override
  -- or services.base_price can change later without rewriting history.
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  customer_notes text,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(time_range) AND lower(time_range) IS NOT NULL AND upper(time_range) IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  -- Same employee, overlapping time, both bookings still "active" (not
  -- cancelled/no-show) → rejected by Postgres itself.
  EXCLUDE USING gist (
    employee_id WITH =,
    time_range WITH &&
  ) WHERE (employee_id IS NOT NULL AND status NOT IN ('CANCELLED', 'NO_SHOW')),
  -- Same bay/resource, overlapping time, both still active → rejected.
  EXCLUDE USING gist (
    resource_id WITH =,
    time_range WITH &&
  ) WHERE (resource_id IS NOT NULL AND status NOT IN ('CANCELLED', 'NO_SHOW'))
);

COMMENT ON COLUMN public.bookings.time_range IS
  'Real timestamptz range — naturally supports bookings that cross midnight, no special-casing needed.';

CREATE INDEX bookings_customer_id_idx ON public.bookings (customer_id);
CREATE INDEX bookings_station_id_idx ON public.bookings (station_id);
CREATE INDEX bookings_employee_id_idx ON public.bookings (employee_id);
CREATE INDEX bookings_station_service_id_idx ON public.bookings (station_service_id);
CREATE INDEX bookings_status_idx ON public.bookings (status);
CREATE INDEX bookings_created_at_idx ON public.bookings (created_at);
-- GiST index on time_range powers the EXCLUDE constraints above and any
-- future overlap/availability queries; a btree on the start time powers
-- simple "upcoming bookings at this station" ordering.
CREATE INDEX bookings_time_range_idx ON public.bookings USING gist (time_range);
CREATE INDEX bookings_station_starts_at_idx ON public.bookings (station_id, lower(time_range));

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Data-integrity checks that span multiple tables (can't be plain CHECK
-- constraints, which only see one row/table):
--  - the booking's resource must actually belong to the booking's
--    station_service (can't book "Bay 1 of Station 2's car wash" on a
--    booking for Station 1's car wash)
--  - the booking's employee must actually be assigned to the booking's
--    station
CREATE OR REPLACE FUNCTION public.validate_booking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  resource_station_service_id uuid;
  employee_is_assigned boolean;
BEGIN
  IF NEW.resource_id IS NOT NULL THEN
    SELECT station_service_id INTO resource_station_service_id
    FROM public.service_resources WHERE id = NEW.resource_id;

    IF resource_station_service_id IS DISTINCT FROM NEW.station_service_id THEN
      RAISE EXCEPTION 'resource_id (%) does not belong to station_service_id (%)', NEW.resource_id, NEW.station_service_id;
    END IF;
  END IF;

  IF NEW.employee_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.employee_station_assignments
      WHERE profile_id = NEW.employee_id AND station_id = NEW.station_id
    ) INTO employee_is_assigned;

    IF NOT employee_is_assigned THEN
      RAISE EXCEPTION 'employee_id (%) is not assigned to station_id (%)', NEW.employee_id, NEW.station_id;
    END IF;
  END IF;

  IF NEW.status = 'CANCELLED' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_booking
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking();

-- ============================================================================
-- booking_status_history: every status transition, recorded automatically —
-- the app never writes to this table directly.
-- ============================================================================
CREATE TABLE public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  status public.booking_status NOT NULL,
  changed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_status_history_booking_id_idx ON public.booking_status_history (booking_id);
CREATE INDEX booking_status_history_created_at_idx ON public.booking_status_history (created_at);

CREATE OR REPLACE FUNCTION public.record_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history (booking_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_booking_status_change
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.record_booking_status_change();
