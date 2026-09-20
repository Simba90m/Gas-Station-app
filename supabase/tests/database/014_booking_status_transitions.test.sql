-- Phase 7.1: validate_booking_status_transition() — the booking lifecycle
-- guard. Forward movement (including skipping steps, e.g. CONFIRMED
-- straight to COMPLETED for a fast walk-in) is allowed; moving backward or
-- leaving a terminal state (COMPLETED/CANCELLED/NO_SHOW) is rejected.
-- NO_SHOW is reachable only from CONFIRMED/CHECKED_IN. This is a
-- data-integrity rule, not an authorization rule — it applies regardless of
-- role, so this file (like 002/005) stays privileged throughout rather than
-- switching to `authenticated`.
BEGIN;
SELECT plan(10);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000001410', 'Transition Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001420', 'Transition Test Service', 'خدمة اختبار', 50, 15);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001430', 'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001420');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001440', 'transition-customer@example.com');

-- Booking 1: walk the full happy path, then try to break out of it.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001451', 'a0000000-0000-0000-0000-000000001440',
        'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001430',
        tstzrange('2024-06-01 09:00:00+02', '2024-06-01 09:15:00+02'), 'CONFIRMED', 50);

SELECT lives_ok(
  $$ UPDATE public.bookings SET status = 'CHECKED_IN' WHERE id = 'a0000000-0000-0000-0000-000000001451' $$,
  'CONFIRMED -> CHECKED_IN is a valid transition'
);
SELECT lives_ok(
  $$ UPDATE public.bookings SET status = 'IN_PROGRESS' WHERE id = 'a0000000-0000-0000-0000-000000001451' $$,
  'CHECKED_IN -> IN_PROGRESS is a valid transition'
);
SELECT throws_ok(
  $$ UPDATE public.bookings SET status = 'PENDING' WHERE id = 'a0000000-0000-0000-0000-000000001451' $$,
  NULL::char(5), NULL,
  'IN_PROGRESS -> PENDING (backward) is rejected'
);
SELECT lives_ok(
  $$ UPDATE public.bookings SET status = 'COMPLETED' WHERE id = 'a0000000-0000-0000-0000-000000001451' $$,
  'IN_PROGRESS -> COMPLETED is a valid transition'
);
SELECT throws_ok(
  $$ UPDATE public.bookings SET status = 'CONFIRMED' WHERE id = 'a0000000-0000-0000-0000-000000001451' $$,
  NULL::char(5), NULL,
  'COMPLETED is terminal — cannot transition to CONFIRMED'
);

-- Booking 2: a forward SKIP (CONFIRMED straight to COMPLETED) must remain
-- allowed — this is the existing behavior 005_feedback_rules.test.sql
-- already relies on for a fast walk-in with no separate check-in step.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001452', 'a0000000-0000-0000-0000-000000001440',
        'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001430',
        tstzrange('2024-06-01 10:00:00+02', '2024-06-01 10:15:00+02'), 'CONFIRMED', 50);

SELECT lives_ok(
  $$ UPDATE public.bookings SET status = 'COMPLETED' WHERE id = 'a0000000-0000-0000-0000-000000001452' $$,
  'CONFIRMED -> COMPLETED (skipping CHECKED_IN/IN_PROGRESS) remains a valid forward skip'
);

-- Booking 3: PENDING cannot become NO_SHOW (only CONFIRMED/CHECKED_IN can).
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001453', 'a0000000-0000-0000-0000-000000001440',
        'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001430',
        tstzrange('2024-06-01 11:00:00+02', '2024-06-01 11:15:00+02'), 'PENDING', 50);

SELECT throws_ok(
  $$ UPDATE public.bookings SET status = 'NO_SHOW' WHERE id = 'a0000000-0000-0000-0000-000000001453' $$,
  NULL::char(5), NULL,
  'PENDING -> NO_SHOW is rejected (only CONFIRMED/CHECKED_IN can become NO_SHOW)'
);

-- Booking 4: CONFIRMED -> NO_SHOW is valid.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001454', 'a0000000-0000-0000-0000-000000001440',
        'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001430',
        tstzrange('2024-06-01 12:00:00+02', '2024-06-01 12:15:00+02'), 'CONFIRMED', 50);

SELECT lives_ok(
  $$ UPDATE public.bookings SET status = 'NO_SHOW' WHERE id = 'a0000000-0000-0000-0000-000000001454' $$,
  'CONFIRMED -> NO_SHOW is a valid transition'
);

-- Booking 5: any non-terminal state can be cancelled, and CANCELLED is terminal.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001455', 'a0000000-0000-0000-0000-000000001440',
        'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001430',
        tstzrange('2024-06-01 13:00:00+02', '2024-06-01 13:15:00+02'), 'PENDING', 50);

SELECT lives_ok(
  $$ UPDATE public.bookings SET status = 'CANCELLED' WHERE id = 'a0000000-0000-0000-0000-000000001455' $$,
  'PENDING -> CANCELLED is a valid transition from any non-terminal state'
);
SELECT throws_ok(
  $$ UPDATE public.bookings SET status = 'CONFIRMED' WHERE id = 'a0000000-0000-0000-0000-000000001455' $$,
  NULL::char(5), NULL,
  'CANCELLED is terminal — cannot transition back to CONFIRMED'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
