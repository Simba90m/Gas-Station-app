-- Phase 7.1: queue_entries.converted_booking_id — schema-only for this
-- phase (the actual walk-in -> booking conversion RPC/UI is Phase 7.4).
-- Verifies the column exists, accepts a real booking id, rejects a
-- nonexistent one via its FK, and is cleared (not blocked) if the
-- referenced booking is ever deleted.
BEGIN;
SELECT plan(4);

SELECT has_column('public', 'queue_entries', 'converted_booking_id', 'queue_entries.converted_booking_id exists');

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000001710', 'Queue Conversion Station', 'محطة الطابور', 'Addr', 'عنوان', 31.2, 29.9);
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001720', 'Queue Test Service', 'خدمة اختبار', 50, 15);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001730', 'a0000000-0000-0000-0000-000000001710', 'a0000000-0000-0000-0000-000000001720');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001740', 'queue-customer@example.com');

INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001750', 'a0000000-0000-0000-0000-000000001740',
        'a0000000-0000-0000-0000-000000001710', 'a0000000-0000-0000-0000-000000001730',
        tstzrange('2024-01-08 09:00:00+02', '2024-01-08 09:15:00+02'), 'IN_PROGRESS', 50);

INSERT INTO public.queues (id, station_id, station_service_id)
VALUES ('a0000000-0000-0000-0000-000000001760', 'a0000000-0000-0000-0000-000000001710', 'a0000000-0000-0000-0000-000000001730');
INSERT INTO public.queue_entries (id, queue_id, customer_id, position, status, converted_booking_id)
VALUES ('a0000000-0000-0000-0000-000000001770', 'a0000000-0000-0000-0000-000000001760',
        'a0000000-0000-0000-0000-000000001740', 1, 'IN_SERVICE', 'a0000000-0000-0000-0000-000000001750');

SELECT is(
  (SELECT converted_booking_id FROM public.queue_entries WHERE id = 'a0000000-0000-0000-0000-000000001770'),
  'a0000000-0000-0000-0000-000000001750'::uuid,
  'converted_booking_id correctly stores a real booking id'
);

SELECT throws_ok(
  $$ UPDATE public.queue_entries SET converted_booking_id = 'a0000000-0000-0000-0000-00000000dead'
     WHERE id = 'a0000000-0000-0000-0000-000000001770' $$,
  '23503'::char(5), NULL,
  'converted_booking_id rejects a booking id that does not exist (foreign key)'
);

DELETE FROM public.bookings WHERE id = 'a0000000-0000-0000-0000-000000001750';

SELECT is(
  (SELECT converted_booking_id FROM public.queue_entries WHERE id = 'a0000000-0000-0000-0000-000000001770'),
  NULL::uuid,
  'deleting the referenced booking clears converted_booking_id (ON DELETE SET NULL) rather than blocking the delete'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
