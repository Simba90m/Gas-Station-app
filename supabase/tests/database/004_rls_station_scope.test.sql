-- Verifies "STATION_MANAGER: access only to assigned station(s)" — a
-- station manager assigned to Station 1 must not see Station 2's bookings,
-- and must see Station 1's.
BEGIN;
SELECT plan(3);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000301', 'station1-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000000301';

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000302', 'some-customer@example.com');

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES
  ('a0000000-0000-0000-0000-000000000310', 'Station One', 'محطة واحد', 'Addr 1', 'عنوان 1', 31.2, 29.9),
  ('a0000000-0000-0000-0000-000000000320', 'Station Two', 'محطة اثنين', 'Addr 2', 'عنوان 2', 31.3, 30.0);

INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000310');

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000000330', 'Test Service', 'خدمة اختبار', 50, 15);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES
  ('a0000000-0000-0000-0000-000000000340', 'a0000000-0000-0000-0000-000000000310', 'a0000000-0000-0000-0000-000000000330'),
  ('a0000000-0000-0000-0000-000000000350', 'a0000000-0000-0000-0000-000000000320', 'a0000000-0000-0000-0000-000000000330');

INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES
  ('a0000000-0000-0000-0000-000000000360', 'a0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000310',
   'a0000000-0000-0000-0000-000000000340', tstzrange('2024-06-15 09:00:00+02', '2024-06-15 09:15:00+02'), 'CONFIRMED', 50),
  ('a0000000-0000-0000-0000-000000000370', 'a0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000320',
   'a0000000-0000-0000-0000-000000000350', tstzrange('2024-06-15 09:00:00+02', '2024-06-15 09:15:00+02'), 'CONFIRMED', 50);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000301';

SELECT is(
  (SELECT count(*) FROM public.bookings WHERE id = 'a0000000-0000-0000-0000-000000000360')::int,
  1,
  'station 1 manager can see station 1''s booking'
);
SELECT is(
  (SELECT count(*) FROM public.bookings WHERE id = 'a0000000-0000-0000-0000-000000000370')::int,
  0,
  'station 1 manager cannot see station 2''s booking'
);
SELECT is(
  (SELECT is_station_staff('a0000000-0000-0000-0000-000000000320'))::boolean,
  false,
  'is_station_staff() correctly denies an unrelated station'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
