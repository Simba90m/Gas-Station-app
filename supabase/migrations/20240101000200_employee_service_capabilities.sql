-- ============================================================================
-- employee_service_capabilities: which catalog services an employee is
-- capable of performing.
--
-- Keyed to the GLOBAL service (services.id), not a station's specific
-- offering (station_services.id) — a skill belongs to the person, not to
-- which station they happen to be standing in. What differs per station is
-- whether that station offers the service at all (station_services) and
-- whether this employee is assigned there (employee_station_assignments).
-- Keeping capability station-agnostic means recording "Ahmed can do Car
-- Wash Premium" once, not once per station he might ever work at, and
-- keeps it meaningful even before he's assigned anywhere.
--
-- This is what lets a future booking engine answer "can employee X perform
-- service Y at station Z at time T?" as three independent, already-modeled
-- facts: assigned to Z (employee_station_assignments), capable of Y (this
-- table), and working at T (employee_working_hours / shifts) — combined
-- with Z actually offering Y (station_services). No new relationship
-- invents a parallel concept; this is the one genuinely missing piece.
-- ============================================================================
CREATE TABLE public.employee_service_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, service_id)
);

CREATE INDEX employee_service_capabilities_employee_id_idx ON public.employee_service_capabilities (employee_id);
CREATE INDEX employee_service_capabilities_service_id_idx ON public.employee_service_capabilities (service_id);

-- RLS mirrors employees_select/employees_update exactly (self, OWNER/MANAGER,
-- or staff at a station this employee is assigned to) — capability is
-- managed by whoever can already manage the employee record itself.
ALTER TABLE public.employee_service_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_service_capabilities FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_service_capabilities_select ON public.employee_service_capabilities
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employee_service_capabilities.employee_id AND public.is_station_staff(esa.station_id)
    )
  );

CREATE POLICY employee_service_capabilities_write ON public.employee_service_capabilities
  FOR ALL TO authenticated
  USING (
    public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employee_service_capabilities.employee_id AND public.is_station_staff(esa.station_id)
    )
  )
  WITH CHECK (
    public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.employee_station_assignments esa
      WHERE esa.profile_id = employee_service_capabilities.employee_id AND public.is_station_staff(esa.station_id)
    )
  );
