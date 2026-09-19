-- Verifies RLS actually isolates customers from each other at the database
-- level — "CUSTOMER: cannot access other customers' information" from the
-- project brief. This connects as the `authenticated` Postgres role (same
-- role every logged-in user connects as through Supabase) and switches
-- identity via the request.jwt.claim.sub GUC, exactly like PostgREST does.
BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000201', 'iso-customer-a@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000202', 'iso-customer-b@example.com');

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000210', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000000220', 'Test Service', 'خدمة اختبار', 50, 15);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000000230', 'a0000000-0000-0000-0000-000000000210', 'a0000000-0000-0000-0000-000000000220');

INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES (
  'a0000000-0000-0000-0000-000000000240', 'a0000000-0000-0000-0000-000000000201',
  'a0000000-0000-0000-0000-000000000210', 'a0000000-0000-0000-0000-000000000230',
  tstzrange('2024-06-15 09:00:00+02', '2024-06-15 09:15:00+02'), 'CONFIRMED', 50
);

-- As customer B: cannot see customer A's booking.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000202';
SELECT is(
  (SELECT count(*) FROM public.bookings WHERE id = 'a0000000-0000-0000-0000-000000000240')::int,
  0,
  'customer B cannot see customer A''s booking'
);
SELECT is(
  (SELECT count(*) FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000201')::int,
  0,
  'customer B cannot see customer A''s profile'
);

-- As customer A: can see their own booking and profile.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000201';
SELECT is(
  (SELECT count(*) FROM public.bookings WHERE id = 'a0000000-0000-0000-0000-000000000240')::int,
  1,
  'customer A can see their own booking'
);
SELECT is(
  (SELECT count(*) FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000201')::int,
  1,
  'customer A can see their own profile'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
