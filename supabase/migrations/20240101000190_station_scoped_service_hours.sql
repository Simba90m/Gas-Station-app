-- ============================================================================
-- Rescopes service_operating_hours from "per global catalog service"
-- (service_id — one schedule shared by every station that offers it) to
-- "per station's own offering of that service" (station_service_id).
--
-- Why the existing schema can't support this: Phase 5 requires two stations
-- offering the same catalog service to be able to run it on different
-- hours (e.g. one station's Car Wash open later than another's — the same
-- reason the brief's own bay example already forced service_resources to
-- key off station_service_id instead of service_id — see "Changes from the
-- original plan" below). service_operating_hours.service_id structurally
-- cannot represent that: every row was keyed by the global service, so
-- every station offering "Car Wash" was forced to share one schedule.
-- station_services already exists as exactly "a specific station's
-- offering of a service" — the same join table service_resources already
-- uses — so this migration brings service_operating_hours in line with it
-- instead of inventing a new table.
--
-- Backfill: every existing (service_id, day_of_week) row is fanned out
-- into one row per station_services entry that actually offers that
-- service, copying the same hours — this preserves exactly what every
-- station currently has configured (nothing changes for any station until
-- an admin deliberately edits one going forward). A no-op on a project
-- with no rows yet (e.g. before seeding).
-- ============================================================================

ALTER TABLE public.service_operating_hours
  ADD COLUMN station_service_id uuid REFERENCES public.station_services (id) ON DELETE CASCADE;

INSERT INTO public.service_operating_hours (station_service_id, day_of_week, is_closed, is_24_hours, opens_at, closes_at)
SELECT ss.id, soh.day_of_week, soh.is_closed, soh.is_24_hours, soh.opens_at, soh.closes_at
FROM public.service_operating_hours soh
JOIN public.station_services ss ON ss.service_id = soh.service_id
WHERE soh.station_service_id IS NULL;

DELETE FROM public.service_operating_hours WHERE station_service_id IS NULL;

ALTER TABLE public.service_operating_hours ALTER COLUMN station_service_id SET NOT NULL;
-- CASCADE: drops the old (service_id, day_of_week) unique constraint and
-- the service_id index along with the column, rather than guessing their
-- auto-generated names.
ALTER TABLE public.service_operating_hours DROP COLUMN service_id CASCADE;

ALTER TABLE public.service_operating_hours
  ADD CONSTRAINT service_operating_hours_station_service_id_day_of_week_key UNIQUE (station_service_id, day_of_week);
CREATE INDEX service_operating_hours_station_service_id_idx ON public.service_operating_hours (station_service_id);

COMMENT ON COLUMN public.service_operating_hours.opens_at IS
  'May be later than closes_at, meaning the window crosses midnight (e.g. 12:00-04:00). Interpreted by application logic, not enforced by the schema.';

-- ------------------------------------------------------------------------
-- RLS: same visibility/write rules as before (public sees an active
-- station's active offering; that station's own staff always see their
-- own; only OWNER/MANAGER write — unchanged restrictiveness, just
-- re-pointed at station_services instead of services). Mirrors
-- service_resources_select/write exactly, since both now key off the same
-- station_service_id.
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS service_operating_hours_select ON public.service_operating_hours;
CREATE POLICY service_operating_hours_select ON public.service_operating_hours
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.station_services ss
      JOIN public.stations s ON s.id = ss.station_id
      WHERE ss.id = service_operating_hours.station_service_id
        AND (public.is_station_staff(ss.station_id) OR (ss.is_active AND s.is_active))
    )
  );

DROP POLICY IF EXISTS service_operating_hours_write ON public.service_operating_hours;
CREATE POLICY service_operating_hours_write ON public.service_operating_hours
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());
