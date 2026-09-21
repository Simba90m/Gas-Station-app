-- Regression + new-behavior coverage for the "configurable business
-- platform" product direction:
--
--   1. An employee can hold MULTIPLE service capabilities, added and
--      removed individually without disturbing the others (brief section 1A).
--   2. An employee can hold MULTIPLE station schedule rows that vary by
--      weekday/time — station assignment is never a permanent 1:1
--      relationship (section 1B); the two triggers from
--      supabase/migrations/20240101000310_employee_station_schedule.sql
--      (must-be-assigned-first, no-two-stations-at-once) are exercised
--      directly.
--   3. Availability (available_employees_for_slot(), via get_available_slots())
--      requires ALL FIVE conditions from section 1C: active, capable,
--      assigned to THIS station, scheduled for this date/time, and no
--      conflicting booking — each checked in isolation.
--   4. services.category (supabase/migrations/20240101000300_service_category.sql):
--      a BOOKABLE service still works end-to-end through
--      get_available_slots()/create_booking()/join_queue(); an INFO
--      service (Fuel) and a CONTENT service (Café) can never enter the
--      booking or queue journey, even by calling the RPCs directly.
--   5. Configuration: an inactive (is_active = false) station_services row
--      is not exposed to get_available_slots()/create_booking(); a
--      reactivated one is.
--
-- Reference date: 2024-01-08 is a Monday (Postgres DOW = 1).
BEGIN;
SELECT plan(27);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES
  ('a0000000-0000-0000-0000-000000002210', 'Sched Station 1', 'محطة 1', 'Addr 1', 'عنوان 1', 31.2, 29.9),
  ('a0000000-0000-0000-0000-000000002220', 'Sched Station 2', 'محطة 2', 'Addr 2', 'عنوان 2', 31.3, 30.0),
  ('a0000000-0000-0000-0000-000000002290', 'Sched Station 3', 'محطة 3', 'Addr 3', 'عنوان 3', 31.4, 30.1);

-- Two bookable services, so one employee can hold two capabilities.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, requires_employee_selection)
VALUES
  ('a0000000-0000-0000-0000-000000002230', 'Sched Wash', 'غسيل', 80, 30, true),
  ('a0000000-0000-0000-0000-000000002231', 'Sched Oil', 'زيت', 120, 20, true);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES
  ('a0000000-0000-0000-0000-000000002240', 'a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230'),
  ('a0000000-0000-0000-0000-000000002241', 'a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002231'),
  ('a0000000-0000-0000-0000-000000002242', 'a0000000-0000-0000-0000-000000002220', 'a0000000-0000-0000-0000-000000002230');

INSERT INTO public.station_operating_hours (station_id, day_of_week, opens_at, closes_at)
VALUES
  ('a0000000-0000-0000-0000-000000002210', 1, '06:00', '22:00'),
  ('a0000000-0000-0000-0000-000000002220', 1, '06:00', '22:00');

INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
VALUES
  ('a0000000-0000-0000-0000-000000002240', 1, '06:00', '22:00'),
  ('a0000000-0000-0000-0000-000000002241', 1, '06:00', '22:00'),
  ('a0000000-0000-0000-0000-000000002242', 1, '06:00', '22:00');

-- The employee under test: Ahmed-like, will be assigned to BOTH stations.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000002250', 'sched-emp@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000002250';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000002250');

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000002260', 'sched-customer@example.com');

-- ============================================================================
-- 1. Multiple service capabilities — add two, remove one individually.
-- ============================================================================
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES
  ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002230'),
  ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002231');

SELECT is(
  (SELECT count(*) FROM public.employee_service_capabilities WHERE employee_id = 'a0000000-0000-0000-0000-000000002250')::int,
  2,
  'an employee can hold multiple service capabilities at once'
);

DELETE FROM public.employee_service_capabilities
WHERE employee_id = 'a0000000-0000-0000-0000-000000002250' AND service_id = 'a0000000-0000-0000-0000-000000002231';

SELECT is(
  (SELECT count(*) FROM public.employee_service_capabilities WHERE employee_id = 'a0000000-0000-0000-0000-000000002250')::int,
  1,
  'removing one capability does not remove the others'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.employee_service_capabilities
    WHERE employee_id = 'a0000000-0000-0000-0000-000000002250' AND service_id = 'a0000000-0000-0000-0000-000000002230'
  ),
  'the remaining capability is specifically the one not removed'
);

-- Deliberately NOT re-adding the Oil capability here — section 3b below
-- checks availability without it first, then grants it.

-- ============================================================================
-- 2. Multiple, varying station assignments + schedule (section 1B's exact
--    Monday/Wednesday-style example, using Monday split between two
--    stations to stay inside this file's single reference date).
-- ============================================================================

-- A schedule row cannot be created before the station assignment exists.
SELECT throws_ok(
  $$ INSERT INTO public.employee_station_schedule (employee_id, station_id, day_of_week, starts_at, ends_at)
     VALUES ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002210', 1, '08:00', '12:00') $$,
  NULL::char(5), NULL,
  'a schedule row is rejected when the employee is not yet assigned to that station'
);

INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES
  ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002210'),
  ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002220'),
  ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002290');

SELECT is(
  (SELECT count(*) FROM public.employee_station_assignments WHERE profile_id = 'a0000000-0000-0000-0000-000000002250')::int,
  3,
  'an employee can be assigned to multiple stations at once (not a permanent 1:1 relationship)'
);

-- Monday: Station 1 morning, Station 2 afternoon — same day, two stations,
-- non-overlapping times, exactly like the brief's Wednesday example.
INSERT INTO public.employee_station_schedule (employee_id, station_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002210', 1, '08:00', '12:00');

INSERT INTO public.employee_station_schedule (employee_id, station_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002220', 1, '13:00', '20:00');

SELECT is(
  (SELECT count(*) FROM public.employee_station_schedule WHERE employee_id = 'a0000000-0000-0000-0000-000000002250')::int,
  2,
  'the same employee can have two schedule rows on the same day at two different stations, non-overlapping'
);

-- Overlapping times at two stations, same day, must be rejected. Uses a
-- THIRD station (2290) that has no schedule row yet for this employee/day
-- -- reusing station 2220 (which already has a Monday row) would instead
-- be caught by the table's own UNIQUE (employee_id, station_id,
-- day_of_week) constraint, which is a different mechanism and would not
-- actually exercise the cross-station overlap trigger being tested here.
SELECT throws_ok(
  $$ INSERT INTO public.employee_station_schedule (employee_id, station_id, day_of_week, starts_at, ends_at)
     VALUES ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002290', 1, '11:00', '15:00') $$,
  NULL::char(5), NULL,
  'an employee cannot be scheduled at two stations at overlapping times on the same day'
);

-- ============================================================================
-- 3. Availability requires ALL FIVE conditions (section 1C), checked via
--    get_available_slots() at Station 1, 09:00 Monday (inside the
--    08:00-12:00 Station-1 schedule window above).
-- ============================================================================

-- 3a. Baseline: active + capable + assigned + scheduled + no conflict -> available.
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid],
  'meeting all five availability conditions offers the employee for the slot'
);

-- 3b. Requires matching capability: not capable of Sched Oil at Station 1
-- even though scheduled+assigned+active there at the same time.
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002231', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp
     AND candidate_employee_ids @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid])::int,
  0,
  'availability requires the matching service capability -- removed above, not yet present for Sched Oil'
);
-- Restore capability, remove it again immediately after the assertion below.
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000002250', 'a0000000-0000-0000-0000-000000002231')
ON CONFLICT DO NOTHING;
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002231', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid],
  'once the capability is granted, the employee becomes available for that service'
);

-- 3c. Requires matching station: at 09:00 the employee's Station-2 window
-- (13:00-20:00) hasn't started, so Station 2 must not offer them at 09:00.
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002220', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp
     AND candidate_employee_ids @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid])::int,
  0,
  'availability requires assignment/schedule AT THE REQUESTED STATION for that date/time -- not offered at Station 2 at 9am'
);
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000002220', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 13:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid],
  'the same employee IS offered at Station 2 once inside that station''s own scheduled window (13:00-20:00)'
);

-- 3d. Requires working hours: 13:00 at Station 1 is outside the 08:00-12:00
-- window, so Station 1 must not offer them then even though they're
-- assigned to Station 1 in general.
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 13:00:00'::timestamp
     AND candidate_employee_ids @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid])::int,
  0,
  'availability requires the requested time to fall inside the station-specific working hours'
);

-- 3e. Requires no conflicting booking: book the employee 09:00-09:30 at
-- Station 1, then the same slot must no longer offer them.
INSERT INTO public.bookings (customer_id, station_id, station_service_id, employee_id, time_range, status, price)
VALUES (
  'a0000000-0000-0000-0000-000000002260', 'a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002240',
  'a0000000-0000-0000-0000-000000002250',
  tstzrange('2024-01-08 09:00:00'::timestamp AT TIME ZONE 'Africa/Cairo', '2024-01-08 09:30:00'::timestamp AT TIME ZONE 'Africa/Cairo'),
  'CONFIRMED', 80
);
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp
     AND candidate_employee_ids @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid])::int,
  0,
  'an existing conflicting booking removes the employee from availability for the overlapping slot'
);
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 10:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid],
  'the employee is available again once outside the conflicting booking''s time range'
);

-- 3f. Requires active employee: deactivate, must disappear from availability
-- entirely; reactivate, must return.
UPDATE public.employees SET is_active = false WHERE id = 'a0000000-0000-0000-0000-000000002250';
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 10:00:00'::timestamp
     AND candidate_employee_ids @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid])::int,
  0,
  'an inactive employee is never offered, regardless of capability/assignment/schedule'
);
UPDATE public.employees SET is_active = true WHERE id = 'a0000000-0000-0000-0000-000000002250';
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 10:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000002250'::uuid],
  'reactivating the employee restores their availability'
);

-- ============================================================================
-- 4. services.category — BOOKABLE keeps working; INFO/CONTENT are blocked
--    from booking AND queue, even calling the RPCs directly.
-- ============================================================================

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, category)
VALUES ('a0000000-0000-0000-0000-000000002270', 'Sched Fuel', 'وقود', 0, NULL, 'INFO');
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, category)
VALUES ('a0000000-0000-0000-0000-000000002271', 'Sched Cafe Item', 'كافيه', 25, NULL, 'CONTENT');

INSERT INTO public.station_services (id, station_id, service_id)
VALUES
  ('a0000000-0000-0000-0000-000000002280', 'a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002270'),
  ('a0000000-0000-0000-0000-000000002281', 'a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002271');

INSERT INTO public.service_operating_hours (station_service_id, day_of_week, is_24_hours)
VALUES
  ('a0000000-0000-0000-0000-000000002280', 1, true),
  ('a0000000-0000-0000-0000-000000002281', 1, true);

-- A BOOKABLE service still produces slots and a real booking.
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 11:00:00'::timestamp
  ),
  'a BOOKABLE service continues to produce slots via get_available_slots()'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000002260';
SELECT lives_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000002260', 'a0000000-0000-0000-0000-000000002210',
       'a0000000-0000-0000-0000-000000002230',
       '2024-01-08 11:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  'create_booking() still succeeds for a BOOKABLE service'
);
RESET ROLE;
SET LOCAL ROLE postgres;

-- Fuel (INFO): no slots at all, and get_available_slots()/create_booking()
-- treat it exactly as "not offered" (not found), even though the row,
-- hours, and station_services offering all exist and are active.
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002270', '2024-01-08'::date))::int,
  0,
  'Fuel (category = INFO) never produces a slot via get_available_slots()'
);
SELECT throws_ok(
  $$ SELECT public._create_booking_core(
       'a0000000-0000-0000-0000-000000002260', 'a0000000-0000-0000-0000-000000002210',
       'a0000000-0000-0000-0000-000000002270',
       '2024-01-08 11:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  NULL::char(5), NULL,
  'Fuel (category = INFO) cannot be booked even by calling the booking core function directly'
);

-- Café (CONTENT): also never produces a slot or a booking.
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002271', '2024-01-08'::date))::int,
  0,
  'Café content (category = CONTENT) never produces a slot via get_available_slots()'
);
SELECT throws_ok(
  $$ SELECT public._create_booking_core(
       'a0000000-0000-0000-0000-000000002260', 'a0000000-0000-0000-0000-000000002210',
       'a0000000-0000-0000-0000-000000002271',
       '2024-01-08 11:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  NULL::char(5), NULL,
  'Café content cannot be booked even by calling the booking core function directly'
);

-- Café also cannot be joined as a walk-in queue, even though a queue row
-- technically can exist for its station_service (queues doesn't itself
-- encode category) — _join_queue_core() is where this is actually refused.
INSERT INTO public.queues (station_id, station_service_id, is_open)
VALUES ('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002281', true);
SELECT throws_ok(
  $$ SELECT public._join_queue_core('a0000000-0000-0000-0000-000000002260', 'a0000000-0000-0000-0000-000000002281') $$,
  NULL::char(5), NULL,
  'Café content (category = CONTENT) cannot be joined as a walk-in queue'
);

-- A BOOKABLE service's queue still works, for contrast/regression.
INSERT INTO public.queues (station_id, station_service_id, is_open)
VALUES ('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002240', true);
SELECT lives_ok(
  $$ SELECT public._join_queue_core('a0000000-0000-0000-0000-000000002260', 'a0000000-0000-0000-0000-000000002240') $$,
  'a BOOKABLE service''s walk-in queue still works via _join_queue_core()'
);

-- ============================================================================
-- 5. Configuration: an inactive station_services row is not exposed;
--    reactivating it makes it exposed again.
-- ============================================================================
UPDATE public.station_services SET is_active = false WHERE id = 'a0000000-0000-0000-0000-000000002240';
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date))::int,
  0,
  'a deactivated station_services row (owner turned it off) is no longer exposed to booking'
);
UPDATE public.station_services SET is_active = true WHERE id = 'a0000000-0000-0000-0000-000000002240';
-- 10:00 is checked here (not 11:00, which the create_booking() call above
-- just consumed) — it falls inside the employee's free window between the
-- 09:00-09:30 conflict booking (section 3e) and the 11:00-11:30 one just
-- created, so this isolates "is the offering exposed again" from employee
-- availability, which sections 3 already covered exhaustively.
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000002210', 'a0000000-0000-0000-0000-000000002230', '2024-01-08'::date)
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 10:00:00'::timestamp
  ),
  'reactivating it makes the service exposed to booking again'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
