-- Dual-channel (phone + email) OTP verification
-- (supabase/migrations/20240101000270_customer_dual_channel_verification.sql).
--
-- Covers: profiles.email exists and starts NULL, sync_profile_email() only
-- mirrors auth.users.email into profiles.email once Supabase has actually
-- confirmed it (email_confirmed_at set) — an unconfirmed email change does
-- NOT leak into profiles.email, profiles_email_unique_idx rejects a
-- duplicate confirmed email, customer_email_registered() is boolean-only
-- and CUSTOMER-scoped (mirrors customer_phone_registered()),
-- get_queue_ticket_status() replaces kiosk_queue_status() with real
-- session-based authorization (owner or station staff only, not an
-- unrelated customer), and the three kiosk_* functions are actually gone.
BEGIN;
SELECT plan(15);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000020010', 'Dual Channel Station', 'محطة التحقق', 'Addr', 'عنوان', 31.2, 29.9);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000020020', 'Dual Channel Service', 'خدمة التحقق', 40, 15);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000020030', 'a0000000-0000-0000-0000-000000020010', 'a0000000-0000-0000-0000-000000020020');

INSERT INTO public.station_operating_hours (station_id, day_of_week, opens_at, closes_at)
VALUES ('a0000000-0000-0000-0000-000000020010', 1, '06:00', '22:00');
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
VALUES ('a0000000-0000-0000-0000-000000020030', 1, '06:00', '22:00');

INSERT INTO public.queues (id, station_id, station_service_id, is_open)
VALUES ('a0000000-0000-0000-0000-000000020040', 'a0000000-0000-0000-0000-000000020010', 'a0000000-0000-0000-0000-000000020030', true);

-- Customer A (owns the queue entry under test), Customer B (unrelated),
-- a station-staff employee assigned to this station.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000020050', 'dual-customer-a@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000020051', 'dual-customer-b@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000020052', 'dual-staff@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000020052';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000020052');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000020052', 'a0000000-0000-0000-0000-000000020010');

-- ----------------------------------------------------------------------
-- 1. profiles.email exists and starts NULL for a freshly-created profile.
-- ----------------------------------------------------------------------
SELECT has_column('public', 'profiles', 'email', 'profiles.email column exists');
SELECT is(
  (SELECT email FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000020050'),
  NULL,
  'a freshly-created profile has no email until verified'
);

-- ----------------------------------------------------------------------
-- 2. sync_profile_email(): only a CONFIRMED email change reaches
-- profiles.email — this is what makes profiles.email trustworthy as "a
-- verified email" rather than just whatever the client last typed.
-- ----------------------------------------------------------------------
UPDATE auth.users SET email = 'unconfirmed@example.com' WHERE id = 'a0000000-0000-0000-0000-000000020051';
SELECT is(
  (SELECT email FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000020051'),
  NULL,
  'an auth.users email change with no email_confirmed_at does NOT sync into profiles.email'
);

UPDATE auth.users SET email = 'dual-customer-a-verified@example.com', email_confirmed_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000020050';
SELECT is(
  (SELECT email FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000020050'),
  'dual-customer-a-verified@example.com',
  'a CONFIRMED auth.users email change syncs into profiles.email via sync_profile_email()'
);

-- ----------------------------------------------------------------------
-- 3. profiles_email_unique_idx rejects a second profile claiming an
-- already-used (confirmed) email.
-- ----------------------------------------------------------------------
SELECT throws_ok(
  $$ UPDATE auth.users SET email = 'dual-customer-a-verified@example.com', email_confirmed_at = now()
     WHERE id = 'a0000000-0000-0000-0000-000000020052' $$,
  '23505'::char(5), NULL,
  'profiles_email_unique_idx rejects a second profile claiming an already-verified email'
);

UPDATE auth.users SET email = 'dual-staff-verified@example.com', email_confirmed_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000020052';

-- ----------------------------------------------------------------------
-- 4. customer_email_registered(): boolean-only, anon-reachable,
-- CUSTOMER-scoped — mirrors customer_phone_registered() exactly.
-- ----------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT is(
  public.customer_email_registered('dual-customer-a-verified@example.com'), true,
  'customer_email_registered() is true for an existing customer''s verified email'
);
SELECT is(
  public.customer_email_registered('nobody@example.com'), false,
  'customer_email_registered() is false for an email nobody has'
);
SELECT is(
  public.customer_email_registered('dual-staff-verified@example.com'), false,
  'customer_email_registered() is false for a staff member''s email (CUSTOMER-scoped)'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- 5. get_queue_ticket_status(): real session-based authorization,
-- replacing kiosk_queue_status()'s former service-role-only access.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000020050';

CREATE TEMP TABLE t_dual_entry AS
SELECT * FROM public.join_queue('a0000000-0000-0000-0000-000000020050', 'a0000000-0000-0000-0000-000000020030');

CREATE TEMP TABLE t_dual_status AS
SELECT * FROM public.get_queue_ticket_status((SELECT id FROM t_dual_entry));
SELECT is(
  (SELECT status FROM t_dual_status), 'WAITING'::public.queue_status,
  'get_queue_ticket_status() lets the entry''s own customer read it'
);
SELECT is(
  (SELECT rank FROM t_dual_status), 0,
  'get_queue_ticket_status() reports rank 0 for the first (only) entry'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000020051';

SELECT throws_ok(
  format($$ SELECT public.get_queue_ticket_status('%s') $$, (SELECT id FROM t_dual_entry)),
  '42501'::char(5), NULL,
  'get_queue_ticket_status() rejects an unrelated customer reading someone else''s entry'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000020052';

SELECT lives_ok(
  format($$ SELECT public.get_queue_ticket_status('%s') $$, (SELECT id FROM t_dual_entry)),
  'get_queue_ticket_status() lets station staff read an entry at their own station'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- 6. The sessionless kiosk_* functions are actually gone, not just
-- unused — confirms the migration's DROP FUNCTION statements ran.
-- ----------------------------------------------------------------------
SELECT hasnt_function('public', 'kiosk_create_booking', 'kiosk_create_booking() no longer exists');
SELECT hasnt_function('public', 'kiosk_join_queue', 'kiosk_join_queue() no longer exists');
SELECT hasnt_function('public', 'kiosk_queue_status', 'kiosk_queue_status() no longer exists');

SELECT * FROM finish();
ROLLBACK;
