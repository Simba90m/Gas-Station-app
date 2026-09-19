-- Regression test for the bug fixed in
-- 20240101000180_fix_offer_stations_rls_recursion.sql: offers_select and
-- offer_stations_select used to reference each other's raw (FORCE ROW
-- LEVEL SECURITY) rows directly, which Postgres rejects with "infinite
-- recursion detected in policy for relation offer_stations" (42P17) for
-- ANY query against either table, regardless of role. This specifically
-- exercises the path that used to recurse: a station-assigned staff member
-- querying an offer that is not yet publicly active, so offers_select must
-- fall through to its third branch (the offer_stations EXISTS check),
-- which in turn evaluates offer_stations_select.
BEGIN;
SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000901', 'offers-station-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000000901';

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000910', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000000901', 'a0000000-0000-0000-0000-000000000910');

-- Starts 30 days from now: offers_select's first branch
-- (is_active AND now() BETWEEN starts_at AND ends_at) is false, and this
-- profile isn't OWNER/MANAGER, so visibility depends entirely on the
-- offer_stations branch — the one that used to recurse.
INSERT INTO public.offers (id, title_en, title_ar, discount_type, discount_value, starts_at, ends_at, is_active)
VALUES (
  'a0000000-0000-0000-0000-000000000920', 'Future Offer', 'عرض مستقبلي',
  'PERCENTAGE', 10, now() + interval '30 days', now() + interval '60 days', true
);
INSERT INTO public.offer_stations (offer_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000000920', 'a0000000-0000-0000-0000-000000000910');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000901';

SELECT lives_ok(
  $$ SELECT count(*) FROM public.offers $$,
  'querying offers as station staff does not raise infinite recursion'
);
SELECT lives_ok(
  $$ SELECT count(*) FROM public.offer_stations $$,
  'querying offer_stations directly does not raise infinite recursion either'
);
SELECT is(
  (SELECT count(*) FROM public.offers WHERE id = 'a0000000-0000-0000-0000-000000000920')::int,
  1,
  'the station-assigned staff member can see the not-yet-public offer via the offer_stations branch'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
