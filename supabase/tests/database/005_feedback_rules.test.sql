-- Verifies: (1) feedback can only be submitted for a COMPLETED booking, and
-- (2) a booking can only ever have one feedback row (no duplicate/fake
-- reviews for the same booking).
BEGIN;
SELECT plan(3);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for
-- why). This test exercises a CHECK constraint/trigger rule, not RLS, so
-- it stays elevated for the whole file rather than switching to
-- `authenticated` — same as the local Docker superuser behavior it's
-- restoring parity with.
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000401', 'fb-customer@example.com');
INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000410', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000000420', 'Test Service', 'خدمة اختبار', 50, 15);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000000430', 'a0000000-0000-0000-0000-000000000410', 'a0000000-0000-0000-0000-000000000420');

INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000000440', 'a0000000-0000-0000-0000-000000000401',
        'a0000000-0000-0000-0000-000000000410', 'a0000000-0000-0000-0000-000000000430',
        tstzrange('2024-06-15 09:00:00+02', '2024-06-15 09:15:00+02'), 'CONFIRMED', 50);

-- Booking is still CONFIRMED (not COMPLETED) -> feedback rejected.
-- (NULL errcode = don't check a specific SQLSTATE, just that it throws —
-- pgTAP's 2/3-arg text forms instead match the 2nd arg against the error
-- MESSAGE, which isn't what we want here.)
SELECT throws_ok(
  $$ INSERT INTO public.feedback (booking_id, rating, category) VALUES ('a0000000-0000-0000-0000-000000000440', 5, 'SERVICE_QUALITY') $$,
  NULL::char(5), NULL,
  'feedback for a non-COMPLETED booking is rejected'
);

UPDATE public.bookings SET status = 'COMPLETED' WHERE id = 'a0000000-0000-0000-0000-000000000440';

SELECT lives_ok(
  $$ INSERT INTO public.feedback (booking_id, rating, category) VALUES ('a0000000-0000-0000-0000-000000000440', 5, 'SERVICE_QUALITY') $$,
  'feedback for a COMPLETED booking is accepted'
);

-- A second feedback row for the same booking -> rejected (UNIQUE booking_id).
SELECT throws_ok(
  $$ INSERT INTO public.feedback (booking_id, rating, category) VALUES ('a0000000-0000-0000-0000-000000000440', 1, 'OTHER') $$,
  NULL::char(5), NULL,
  'a second feedback row for the same booking is rejected (no duplicate reviews)'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
