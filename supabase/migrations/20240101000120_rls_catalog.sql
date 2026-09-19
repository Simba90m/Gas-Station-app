-- ============================================================================
-- RLS: stations, station_operating_hours, services, station_services,
-- service_operating_hours, service_resources, offers, offer_stations.
--
-- This is the "public catalog" — customers browse it without being logged
-- in (`anon`) as well as logged in (`authenticated`), per "CUSTOMER: Can
-- read active/public stations/services/offers."
-- ============================================================================

-- --------------------------------------------------------------- stations
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations FORCE ROW LEVEL SECURITY;

CREATE POLICY stations_select ON public.stations
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_station_staff(id));

CREATE POLICY stations_insert ON public.stations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_or_manager());

CREATE POLICY stations_update ON public.stations
  FOR UPDATE TO authenticated
  USING (public.is_station_staff(id))
  WITH CHECK (public.is_station_staff(id));

-- ----------------------------------------------- station_operating_hours
ALTER TABLE public.station_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_operating_hours FORCE ROW LEVEL SECURITY;

CREATE POLICY station_operating_hours_select ON public.station_operating_hours
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stations s
      WHERE s.id = station_operating_hours.station_id
        AND (s.is_active OR public.is_station_staff(s.id))
    )
  );

CREATE POLICY station_operating_hours_write ON public.station_operating_hours
  FOR ALL TO authenticated
  USING (public.is_station_staff(station_id))
  WITH CHECK (public.is_station_staff(station_id));

-- --------------------------------------------------------------- services
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services FORCE ROW LEVEL SECURITY;

CREATE POLICY services_select ON public.services
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_owner_or_manager());

-- The global service catalog (what services exist at all) is configured
-- org-wide; station managers configure their station's *offering* of a
-- service via station_services below, not the catalog itself.
CREATE POLICY services_write ON public.services
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

-- ------------------------------------------------------------- station_services
ALTER TABLE public.station_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_services FORCE ROW LEVEL SECURITY;

CREATE POLICY station_services_select ON public.station_services
  FOR SELECT TO anon, authenticated
  USING (
    public.is_station_staff(station_id)
    OR (
      is_active = true
      AND EXISTS (SELECT 1 FROM public.stations s WHERE s.id = station_services.station_id AND s.is_active)
    )
  );

CREATE POLICY station_services_write ON public.station_services
  FOR ALL TO authenticated
  USING (public.is_station_staff(station_id))
  WITH CHECK (public.is_station_staff(station_id));

-- ------------------------------------------------------- service_operating_hours
ALTER TABLE public.service_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_operating_hours FORCE ROW LEVEL SECURITY;

CREATE POLICY service_operating_hours_select ON public.service_operating_hours
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.services sv
      WHERE sv.id = service_operating_hours.service_id
        AND (sv.is_active OR public.is_owner_or_manager())
    )
  );

CREATE POLICY service_operating_hours_write ON public.service_operating_hours
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

-- ------------------------------------------------------------ service_resources
ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_resources FORCE ROW LEVEL SECURITY;

CREATE POLICY service_resources_select ON public.service_resources
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.station_services ss
      JOIN public.stations s ON s.id = ss.station_id
      WHERE ss.id = service_resources.station_service_id
        AND (public.is_station_staff(ss.station_id) OR (ss.is_active AND s.is_active))
    )
  );

CREATE POLICY service_resources_write ON public.service_resources
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.station_services ss
      WHERE ss.id = service_resources.station_service_id AND public.is_station_staff(ss.station_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.station_services ss
      WHERE ss.id = service_resources.station_service_id AND public.is_station_staff(ss.station_id)
    )
  );

-- ----------------------------------------------------------------- offers
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers FORCE ROW LEVEL SECURITY;

CREATE POLICY offers_select ON public.offers
  FOR SELECT TO anon, authenticated
  USING (
    (is_active AND now() BETWEEN starts_at AND ends_at)
    OR public.is_owner_or_manager()
    OR EXISTS (
      SELECT 1 FROM public.offer_stations os
      WHERE os.offer_id = offers.id AND public.is_station_staff(os.station_id)
    )
  );

-- Org-wide promotions are created by OWNER/MANAGER (not a per-station
-- STATION_MANAGER action, per the brief's admin section).
CREATE POLICY offers_write ON public.offers
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());

-- ------------------------------------------------------------ offer_stations
ALTER TABLE public.offer_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_stations FORCE ROW LEVEL SECURITY;

CREATE POLICY offer_stations_select ON public.offer_stations
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = offer_stations.offer_id
        AND (
          (o.is_active AND now() BETWEEN o.starts_at AND o.ends_at)
          OR public.is_owner_or_manager()
          OR public.is_station_staff(offer_stations.station_id)
        )
    )
  );

CREATE POLICY offer_stations_write ON public.offer_stations
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());
