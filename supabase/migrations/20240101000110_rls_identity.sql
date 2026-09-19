-- ============================================================================
-- RLS: profiles, employees, employee_station_assignments,
-- employee_working_hours, shifts, customers.
--
-- Reminder for every table below: enabling RLS with no policies means
-- "nobody gets any rows" for that role — a safe default. Each policy adds
-- back exactly one allowed access pattern.
-- ============================================================================

-- ---------------------------------------------------------------- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_select_owner_manager ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_owner_or_manager());

-- Station staff can see the profile of a customer/employee they're actually
-- serving (has a booking at their station) — not every customer/employee in
-- the system.
CREATE POLICY profiles_select_related_via_booking ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (b.customer_id = profiles.id OR b.employee_id = profiles.id)
        AND public.is_station_staff(b.station_id)
    )
  );

-- Self-service profile edits are limited to non-sensitive columns by column
-- privilege (see the GRANT below) — role and is_active can only change
-- through the SECURITY DEFINER functions further down, which check the
-- caller is OWNER/MANAGER. This is what actually stops a user from
-- promoting themselves, not just an RLS USING clause.
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, phone, preferred_locale, avatar_url) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.set_profile_role(p_profile_id uuid, p_role public.user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner_or_manager() THEN
    RAISE EXCEPTION 'not authorized to change roles';
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_active(p_profile_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner_or_manager() THEN
    RAISE EXCEPTION 'not authorized to activate/deactivate profiles';
  END IF;
  UPDATE public.profiles SET is_active = p_is_active WHERE id = p_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_profile_role(uuid, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_active(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------- employees
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;

CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employees.id AND public.is_station_staff(esa.station_id)
    )
  );

CREATE POLICY employees_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_or_manager());

CREATE POLICY employees_update ON public.employees
  FOR UPDATE TO authenticated
  USING (
    public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employees.id AND public.is_station_staff(esa.station_id)
    )
  )
  WITH CHECK (
    public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employees.id AND public.is_station_staff(esa.station_id)
    )
  );

-- --------------------------------------------- employee_station_assignments
ALTER TABLE public.employee_station_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_station_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_station_assignments_select ON public.employee_station_assignments
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_station_staff(station_id));

CREATE POLICY employee_station_assignments_write ON public.employee_station_assignments
  FOR ALL TO authenticated
  USING (public.is_station_staff(station_id))
  WITH CHECK (public.is_station_staff(station_id));

-- --------------------------------------------------- employee_working_hours
ALTER TABLE public.employee_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_working_hours FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_working_hours_select ON public.employee_working_hours
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employee_working_hours.employee_id AND public.is_station_staff(esa.station_id)
    )
  );

-- Working hours are manager-set, not self-edited by the employee.
CREATE POLICY employee_working_hours_write ON public.employee_working_hours
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employee_working_hours.employee_id AND public.is_station_staff(esa.station_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employee_working_hours.employee_id AND public.is_station_staff(esa.station_id)
    )
  );

-- ------------------------------------------------------------------ shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts FORCE ROW LEVEL SECURITY;

CREATE POLICY shifts_select ON public.shifts
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_station_staff(station_id));

-- Employees clock themselves in/out; station staff can also manage shifts.
CREATE POLICY shifts_insert ON public.shifts
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_station_staff(station_id));

CREATE POLICY shifts_update ON public.shifts
  FOR UPDATE TO authenticated
  USING (employee_id = auth.uid() OR public.is_station_staff(station_id))
  WITH CHECK (employee_id = auth.uid() OR public.is_station_staff(station_id));

-- ---------------------------------------------------------------- customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.customer_id = customers.id AND public.is_station_staff(b.station_id)
    )
  );
