-- Phase 7.3 follow-up: global (non-Egypt-only) phone numbers +
-- kiosk_join_queue()/kiosk_create_booking()/customer_phone_registered().
--
-- Covers: the relaxed E.164 CHECK constraint accepts a foreign number and
-- still rejects garbage, the new platform-wide unique index rejects a
-- duplicate phone, customer_phone_registered() is boolean-only and
-- CUSTOMER-scoped, and the kiosk_* functions (tested as the actual
-- service_role — not postgres, which would bypass the GRANT check
-- entirely and prove nothing) create a real queue entry/booking for a
-- CUSTOMER id and reject a staff id. A light regression check confirms
-- create_booking()/join_queue()'s own authenticated-only entry points
-- still work after being split into _core + wrapper.
BEGIN;
SELECT plan(19);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000019010', 'Global Phone Station', 'محطة الهاتف', 'Addr', 'عنوان', 31.2, 29.9);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000019020', 'Global Phone Service', 'خدمة الهاتف', 40, 15);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000019030', 'a0000000-0000-0000-0000-000000019010', 'a0000000-0000-0000-0000-000000019020');

INSERT INTO public.station_operating_hours (station_id, day_of_week, opens_at, closes_at)
VALUES ('a0000000-0000-0000-0000-000000019010', 1, '06:00', '22:00');
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
VALUES ('a0000000-0000-0000-0000-000000019030', 1, '06:00', '22:00');

INSERT INTO public.queues (id, station_id, station_service_id, is_open)
VALUES ('a0000000-0000-0000-0000-000000019040', 'a0000000-0000-0000-0000-000000019010', 'a0000000-0000-0000-0000-000000019030', true);

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000019050', 'phone-customer1@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000019051', 'phone-customer2@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000019052', 'phone-staff@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000019052';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000019052');

-- ----------------------------------------------------------------------
-- 1. Relaxed CHECK: accepts a non-Egyptian E.164 number, still rejects
-- obvious garbage.
-- ----------------------------------------------------------------------
UPDATE public.profiles SET phone = '+14155550100' WHERE id = 'a0000000-0000-0000-0000-000000019050';
SELECT is(
  (SELECT phone FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000019050'),
  '+14155550100',
  'profiles.phone accepts a non-Egyptian E.164 number (the CHECK constraint is no longer Egypt-only)'
);

SELECT throws_ok(
  $$ UPDATE public.profiles SET phone = '0123456789' WHERE id = 'a0000000-0000-0000-0000-000000019051' $$,
  NULL::char(5), NULL,
  'profiles.phone still rejects a non-E.164 value (missing leading +)'
);

UPDATE public.profiles SET phone = '+201099990001' WHERE id = 'a0000000-0000-0000-0000-000000019052';

-- ----------------------------------------------------------------------
-- 2. Platform-wide phone uniqueness (partial unique index).
-- ----------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE public.profiles SET phone = '+14155550100' WHERE id = 'a0000000-0000-0000-0000-000000019051' $$,
  '23505'::char(5), NULL,
  'profiles_phone_unique_idx rejects a second profile claiming an already-used phone'
);

UPDATE public.profiles SET phone = '+14155550101' WHERE id = 'a0000000-0000-0000-0000-000000019051';

-- ----------------------------------------------------------------------
-- 3. customer_phone_registered(): boolean-only, anon-reachable,
-- CUSTOMER-scoped (a staff member's phone doesn't count as "a customer").
-- ----------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT is(
  public.customer_phone_registered('+14155550100'), true,
  'customer_phone_registered() is true for an existing customer''s phone'
);
SELECT is(
  public.customer_phone_registered('+15005550199'), false,
  'customer_phone_registered() is false for a phone nobody has'
);
SELECT is(
  public.customer_phone_registered('+201099990001'), false,
  'customer_phone_registered() is false for a staff member''s phone (CUSTOMER-scoped)'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- 4. kiosk_join_queue() / kiosk_queue_status() — tested as the real
-- service_role (not postgres, which would bypass the GRANT entirely).
-- ----------------------------------------------------------------------
SET LOCAL ROLE service_role;

SELECT throws_ok(
  format($$ SELECT public.kiosk_join_queue('%s', 'a0000000-0000-0000-0000-000000019030') $$, 'a0000000-0000-0000-0000-000000019052'),
  NULL::char(5), NULL,
  'kiosk_join_queue() rejects a staff (non-CUSTOMER) id'
);

CREATE TEMP TABLE t_kiosk_entry1 AS
SELECT * FROM public.kiosk_join_queue('a0000000-0000-0000-0000-000000019050', 'a0000000-0000-0000-0000-000000019030');
SELECT is((SELECT position FROM t_kiosk_entry1), 1, 'kiosk_join_queue() creates the first entry at position 1');
SELECT is((SELECT status FROM t_kiosk_entry1), 'WAITING'::public.queue_status, 'kiosk_join_queue() entry starts WAITING');

CREATE TEMP TABLE t_kiosk_status1 AS
SELECT * FROM public.kiosk_queue_status((SELECT id FROM t_kiosk_entry1));
SELECT is((SELECT rank FROM t_kiosk_status1), 0, 'kiosk_queue_status() reports rank 0 (nobody ahead) for the first entry');
SELECT is((SELECT estimated_wait_minutes FROM t_kiosk_status1), 0, 'kiosk_queue_status() reports 0 estimated minutes for rank 0');

CREATE TEMP TABLE t_kiosk_entry2 AS
SELECT * FROM public.kiosk_join_queue('a0000000-0000-0000-0000-000000019051', 'a0000000-0000-0000-0000-000000019030');
SELECT is((SELECT position FROM t_kiosk_entry2), 2, 'kiosk_join_queue() gives the second customer the next position');

CREATE TEMP TABLE t_kiosk_status2 AS
SELECT * FROM public.kiosk_queue_status((SELECT id FROM t_kiosk_entry2));
SELECT is((SELECT rank FROM t_kiosk_status2), 1, 'kiosk_queue_status() reports rank 1 (one ahead) for the second entry');
SELECT is(
  (SELECT estimated_wait_minutes FROM t_kiosk_status2), 15,
  'kiosk_queue_status() estimates rank * service duration (1 * 15 minutes)'
);

-- ----------------------------------------------------------------------
-- 5. kiosk_create_booking() — same rejection for a non-CUSTOMER id, and a
-- real CONFIRMED booking for a valid one.
-- ----------------------------------------------------------------------
SELECT throws_ok(
  format(
    $$ SELECT public.kiosk_create_booking('%s', 'a0000000-0000-0000-0000-000000019010', 'a0000000-0000-0000-0000-000000019020', '2024-01-08 10:00:00'::timestamp AT TIME ZONE 'Africa/Cairo') $$,
    'a0000000-0000-0000-0000-000000019052'
  ),
  NULL::char(5), NULL,
  'kiosk_create_booking() rejects a staff (non-CUSTOMER) id'
);

CREATE TEMP TABLE t_kiosk_booking1 AS
SELECT * FROM public.kiosk_create_booking(
  'a0000000-0000-0000-0000-000000019050', 'a0000000-0000-0000-0000-000000019010',
  'a0000000-0000-0000-0000-000000019020', '2024-01-08 10:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
);
SELECT is((SELECT status FROM t_kiosk_booking1), 'CONFIRMED'::public.booking_status, 'kiosk_create_booking() creates a CONFIRMED booking for a real customer id');
SELECT is(
  (SELECT customer_id FROM t_kiosk_booking1), 'a0000000-0000-0000-0000-000000019050'::uuid,
  'kiosk_create_booking() records the booking under the resolved customer id'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- 6. Regression: create_booking()/join_queue()'s own authenticated-only
-- entry points still behave exactly as before the _core split.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000019050';

CREATE TEMP TABLE t_regression_booking AS
SELECT * FROM public.create_booking(
  'a0000000-0000-0000-0000-000000019050', 'a0000000-0000-0000-0000-000000019010',
  'a0000000-0000-0000-0000-000000019020', '2024-01-08 12:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
);
SELECT is(
  (SELECT status FROM t_regression_booking), 'CONFIRMED'::public.booking_status,
  'create_booking() still works for an authenticated customer after the _create_booking_core split'
);

SELECT throws_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000019051', 'a0000000-0000-0000-0000-000000019010',
       'a0000000-0000-0000-0000-000000019020', '2024-01-08 13:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  NULL::char(5), NULL,
  'create_booking() still rejects a customer booking on behalf of someone else after the split'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
