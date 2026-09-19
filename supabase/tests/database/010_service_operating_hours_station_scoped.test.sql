-- Regression test for
-- 20240101000190_station_scoped_service_hours.sql: two stations offering
-- the SAME catalog service must be able to run different hours for it (the
-- capability the old service_id-keyed table couldn't represent), station
-- staff visibility must follow station_services/stations the same way
-- service_resources already does, and writes must still be
-- OWNER/MANAGER-only (unchanged restrictiveness — only the key changed).
BEGIN;
SELECT plan(6);

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES
  ('a0000000-0000-0000-0000-000000001010', 'Hours Station A', 'محطة أ', 'Addr A', 'عنوان أ', 31.2, 29.9),
  ('a0000000-0000-0000-0000-000000001020', 'Hours Station B', 'محطة ب', 'Addr B', 'عنوان ب', 31.3, 30.0);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001030', 'Shared Service', 'خدمة مشتركة', 100, 30);

-- Same catalog service, offered at both stations, each its own station_services row.
INSERT INTO public.station_services (id, station_id, service_id, is_active)
VALUES
  ('a0000000-0000-0000-0000-000000001040', 'a0000000-0000-0000-0000-000000001010', 'a0000000-0000-0000-0000-000000001030', true),
  ('a0000000-0000-0000-0000-000000001050', 'a0000000-0000-0000-0000-000000001020', 'a0000000-0000-0000-0000-000000001030', true);

-- Station A: 10:00-18:00. Station B: 22:00-03:00 (midnight-crossing) — same
-- service, deliberately different hours, on the same day of week.
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
VALUES
  ('a0000000-0000-0000-0000-000000001040', 2, '10:00', '18:00'),
  ('a0000000-0000-0000-0000-000000001050', 2, '22:00', '03:00');

SELECT is(
  (SELECT closes_at FROM public.service_operating_hours WHERE station_service_id = 'a0000000-0000-0000-0000-000000001040' AND day_of_week = 2),
  '18:00:00'::time,
  'station A keeps its own hours for the shared service'
);
SELECT ok(
  (SELECT opens_at > closes_at FROM public.service_operating_hours WHERE station_service_id = 'a0000000-0000-0000-0000-000000001050' AND day_of_week = 2),
  'station B''s independently-set hours for the SAME service cross midnight, unaffected by station A''s'
);

-- Owner can write (unchanged restrictiveness — same is_owner_or_manager() check as before).
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001060', 'hours-owner@example.com');
UPDATE public.profiles SET role = 'OWNER' WHERE id = 'a0000000-0000-0000-0000-000000001060';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001060';
UPDATE public.service_operating_hours SET closes_at = '19:00'
WHERE station_service_id = 'a0000000-0000-0000-0000-000000001040' AND day_of_week = 2;
SELECT is(
  (SELECT closes_at FROM public.service_operating_hours WHERE station_service_id = 'a0000000-0000-0000-0000-000000001040' AND day_of_week = 2),
  '19:00:00'::time,
  'OWNER can still write service_operating_hours'
);

-- A station manager assigned only to station A: sees A's own hours, and
-- also sees B's (both station_service and station are active — same
-- "active offerings are publicly visible" rule service_resources already
-- follows), but loses visibility once B's offering is deactivated.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001070', 'hours-station-a-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001070';
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001070', 'a0000000-0000-0000-0000-000000001010');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001070';
SELECT is(
  (SELECT count(*) FROM public.service_operating_hours WHERE station_service_id = 'a0000000-0000-0000-0000-000000001040')::int,
  1,
  'station A''s manager can see A''s own hours for the shared service'
);
SELECT is(
  (SELECT count(*) FROM public.service_operating_hours WHERE station_service_id = 'a0000000-0000-0000-0000-000000001050')::int,
  1,
  'station A''s manager can also see B''s hours while B''s offering is active (public visibility, same as service_resources)'
);
-- RLS on UPDATE filters matching rows via USING rather than raising an
-- error, so an UPDATE a role can't see just quietly affects zero rows —
-- the real assertion is that the value stays exactly what OWNER set it to
-- above ('19:00'), not that this statement throws.
UPDATE public.service_operating_hours SET closes_at = '20:00'
WHERE station_service_id = 'a0000000-0000-0000-0000-000000001040' AND day_of_week = 2;
SELECT is(
  (SELECT closes_at FROM public.service_operating_hours WHERE station_service_id = 'a0000000-0000-0000-0000-000000001040' AND day_of_week = 2),
  '19:00:00'::time,
  'a STATION_MANAGER (not OWNER/MANAGER) cannot write service_operating_hours — unchanged restrictiveness'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
