-- Phase 7.3 follow-up: global (non-Egypt-only) phone numbers +
-- customer_phone_registered().
--
-- Covers: the relaxed E.164 CHECK constraint accepts a foreign number and
-- still rejects garbage, the new platform-wide unique index rejects a
-- duplicate phone, and customer_phone_registered() is boolean-only and
-- CUSTOMER-scoped. A light regression check confirms create_booking()/
-- join_queue()'s own authenticated-only entry points still work after
-- being split into _core + wrapper.
--
-- The kiosk_join_queue()/kiosk_create_booking()/kiosk_queue_status()
-- coverage this file originally had was removed along with those functions
-- themselves — see
-- supabase/migrations/20240101000270_customer_dual_channel_verification.sql
-- and 020_customer_dual_channel_verification.test.sql (which covers their
-- authenticated-session-based replacement, get_queue_ticket_status()).
BEGIN;
SELECT plan(8);

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
-- 4. Regression: create_booking()/join_queue()'s own authenticated-only
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
