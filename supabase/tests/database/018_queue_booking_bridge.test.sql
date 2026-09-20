-- Phase 7.3: join_queue() / start_queue_service() / complete_queue_service()
-- and the queue_entries status-transition guard trigger.
--
-- start_queue_service() uses p_start_at = now() (real wall-clock time, since
-- "start service" genuinely means "right now") — so, unlike the fixed-date
-- fixtures in 015/016, the station/service operating-hours fixtures here are
-- is_24_hours for every day of the week, to avoid the test being flaky
-- depending on when the suite actually runs.
BEGIN;
SELECT plan(17);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000001810', 'Queue Bridge Station', 'محطة الطابور', 'Addr', 'عنوان', 31.2, 29.9);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001820', 'Queue Bridge Service', 'خدمة الطابور', 40, 15);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001830', 'a0000000-0000-0000-0000-000000001810', 'a0000000-0000-0000-0000-000000001820');

INSERT INTO public.station_operating_hours (station_id, day_of_week, is_24_hours)
SELECT 'a0000000-0000-0000-0000-000000001810', d, true FROM generate_series(0, 6) AS d;
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, is_24_hours)
SELECT 'a0000000-0000-0000-0000-000000001830', d, true FROM generate_series(0, 6) AS d;

INSERT INTO public.queues (id, station_id, station_service_id, is_open)
VALUES ('a0000000-0000-0000-0000-000000001840', 'a0000000-0000-0000-0000-000000001810', 'a0000000-0000-0000-0000-000000001830', true);

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001850', 'queue-bridge-customer1@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001851', 'queue-bridge-customer2@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001860', 'queue-bridge-staff@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001860';
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001860', 'a0000000-0000-0000-0000-000000001810');

-- ----------------------------------------------------------------------
-- join_queue(): position assignment, one customer per queue at a time,
-- authorization.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001850';

CREATE TEMP TABLE t_entry1 AS
SELECT * FROM public.join_queue('a0000000-0000-0000-0000-000000001850', 'a0000000-0000-0000-0000-000000001830');

SELECT is((SELECT position FROM t_entry1), 1, 'the first customer to join gets position 1');
SELECT is((SELECT status FROM t_entry1), 'WAITING'::public.queue_status, 'a new queue entry starts WAITING');

SELECT throws_ok(
  $$ SELECT public.join_queue('a0000000-0000-0000-0000-000000001850', 'a0000000-0000-0000-0000-000000001830') $$,
  NULL::char(5), NULL,
  'a customer cannot join the same queue twice while already WAITING/CALLED'
);

SELECT throws_ok(
  $$ SELECT public.join_queue('a0000000-0000-0000-0000-000000001851', 'a0000000-0000-0000-0000-000000001830') $$,
  NULL::char(5), NULL,
  'a customer cannot join_queue() on behalf of a different customer'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001851';
CREATE TEMP TABLE t_entry2 AS
SELECT * FROM public.join_queue('a0000000-0000-0000-0000-000000001851', 'a0000000-0000-0000-0000-000000001830');
SELECT is((SELECT position FROM t_entry2), 2, 'the second customer gets the next position');

-- Toggling is_open directly requires staff (queues_write RLS) — briefly
-- drop to the privileged fixture role rather than switching jwt.sub, so the
-- "currently signed in as customer2" context below is undisturbed.
SET LOCAL ROLE postgres;
UPDATE public.queues SET is_open = false WHERE id = 'a0000000-0000-0000-0000-000000001840';
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.join_queue('a0000000-0000-0000-0000-000000001851', 'a0000000-0000-0000-0000-000000001830') $$,
  NULL::char(5), NULL,
  'join_queue() rejects joining a closed queue'
);

SET LOCAL ROLE postgres;
UPDATE public.queues SET is_open = true WHERE id = 'a0000000-0000-0000-0000-000000001840';
SET LOCAL ROLE authenticated;

-- ----------------------------------------------------------------------
-- start_queue_service(): staff-only, creates a real booking, links it.
-- ----------------------------------------------------------------------
SELECT throws_ok(
  format($$ SELECT public.start_queue_service('%s') $$, (SELECT id FROM t_entry1)),
  NULL::char(5), NULL,
  'a plain customer cannot start_queue_service() — staff only'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001860';
CREATE TEMP TABLE t_booking1 AS
SELECT * FROM public.start_queue_service((SELECT id FROM t_entry1));

SELECT is((SELECT status FROM t_booking1), 'CONFIRMED'::public.booking_status, 'start_queue_service() creates a CONFIRMED booking via create_booking()');
SELECT is((SELECT customer_id FROM t_booking1), 'a0000000-0000-0000-0000-000000001850'::uuid, 'the booking is for the queue entry''s own customer');

SELECT is(
  (SELECT status FROM public.queue_entries WHERE id = (SELECT id FROM t_entry1)),
  'IN_SERVICE'::public.queue_status,
  'starting service moves the queue entry to IN_SERVICE'
);
SELECT is(
  (SELECT converted_booking_id FROM public.queue_entries WHERE id = (SELECT id FROM t_entry1)),
  (SELECT id FROM t_booking1),
  'the queue entry is linked to the booking start_queue_service() just created'
);

SELECT throws_ok(
  format($$ SELECT public.start_queue_service('%s') $$, (SELECT id FROM t_entry1)),
  NULL::char(5), NULL,
  'start_queue_service() rejects an entry that is not WAITING/CALLED'
);

-- ----------------------------------------------------------------------
-- complete_queue_service(): staff-only, syncs the linked booking.
-- ----------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001850';
SELECT throws_ok(
  format($$ SELECT public.complete_queue_service('%s') $$, (SELECT id FROM t_entry1)),
  NULL::char(5), NULL,
  'a plain customer cannot complete_queue_service() — staff only'
);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001860';
CREATE TEMP TABLE t_completed1 AS
SELECT * FROM public.complete_queue_service((SELECT id FROM t_entry1));

SELECT is((SELECT status FROM t_completed1), 'COMPLETED'::public.queue_status, 'complete_queue_service() marks the entry COMPLETED');
SELECT is(
  (SELECT status FROM public.bookings WHERE id = (SELECT id FROM t_booking1)),
  'COMPLETED'::public.booking_status,
  'complete_queue_service() syncs the linked booking to COMPLETED'
);

SELECT throws_ok(
  format($$ SELECT public.complete_queue_service('%s') $$, (SELECT id FROM t_entry1)),
  NULL::char(5), NULL,
  'complete_queue_service() rejects an entry that is not IN_SERVICE'
);

-- ----------------------------------------------------------------------
-- Status-transition guard: a COMPLETED entry can never move again, even
-- via a direct UPDATE (not just through the RPCs above).
-- ----------------------------------------------------------------------
SELECT throws_ok(
  format($$ UPDATE public.queue_entries SET status = 'WAITING' WHERE id = '%s' $$, (SELECT id FROM t_entry1)),
  NULL::char(5), NULL,
  'a terminal (COMPLETED) queue entry cannot transition again, even via direct UPDATE'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
