-- Phase 7.1: get_available_slots() — station/service hours intersection,
-- midnight crossing, resource conflicts, employee capability/assignment/
-- working-hours/breaks/conflicts, and specific-employee filtering.
--
-- All wall-clock comparisons go through `AT TIME ZONE 'Africa/Cairo'`
-- explicitly, matching how day_window_range()/get_available_slots()
-- themselves anchor to Cairo — this keeps every comparison correct
-- regardless of the connection's session timezone setting.
--
-- Reference dates (Postgres DOW, 0=Sunday): 2024-01-08 Monday (DOW=1,
-- normal day), 2024-01-09 Tuesday (DOW=2, station closed), 2024-01-10
-- Wednesday (DOW=3, service closed while station stays open), 2024-01-05
-- Friday (DOW=5, midnight-crossing hours).
BEGIN;
SELECT plan(17);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES
  ('a0000000-0000-0000-0000-000000001510', 'Slots Station A', 'محطة أ', 'Addr A', 'عنوان أ', 31.2, 29.9),
  ('a0000000-0000-0000-0000-000000001511', 'Slots Station B', 'محطة ب', 'Addr B', 'عنوان ب', 31.3, 30.0);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, requires_employee_selection, requires_resource)
VALUES ('a0000000-0000-0000-0000-000000001520', 'Slots Test Wash', 'غسيل اختبار', 100, 30, true, true);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001530', 'a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520');

INSERT INTO public.service_resources (id, station_service_id, name_en, name_ar)
VALUES ('a0000000-0000-0000-0000-000000001540', 'a0000000-0000-0000-0000-000000001530', 'Bay 1', 'مسار 1');

-- Station A hours: Monday normal, Tuesday closed, Wednesday normal (service
-- will be closed that day instead), Friday crosses midnight.
INSERT INTO public.station_operating_hours (station_id, day_of_week, is_closed, opens_at, closes_at)
VALUES
  ('a0000000-0000-0000-0000-000000001510', 1, false, '08:00', '20:00'),
  ('a0000000-0000-0000-0000-000000001510', 2, true, NULL, NULL),
  ('a0000000-0000-0000-0000-000000001510', 3, false, '08:00', '20:00'),
  ('a0000000-0000-0000-0000-000000001510', 5, false, '18:00', '02:00');

-- Service hours: Monday narrower than the station's, Tuesday irrelevant
-- (station already closed), Wednesday closed (service closed, station
-- open), Friday crosses midnight within the station's own crossing window.
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, is_closed, opens_at, closes_at)
VALUES
  ('a0000000-0000-0000-0000-000000001530', 1, false, '09:00', '18:00'),
  ('a0000000-0000-0000-0000-000000001530', 2, false, '09:00', '18:00'),
  ('a0000000-0000-0000-0000-000000001530', 3, true, NULL, NULL),
  ('a0000000-0000-0000-0000-000000001530', 5, false, '20:00', '01:00');

-- Employee A: capable, assigned to Station A, works Monday 08:00-16:00
-- with a 12:00-12:30 break.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001551', 'slots-emp-a@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001551';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000001551');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001551', 'a0000000-0000-0000-0000-000000001510');
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001551', 'a0000000-0000-0000-0000-000000001520');
INSERT INTO public.employee_working_hours (employee_id, day_of_week, starts_at, ends_at, break_starts_at, break_ends_at)
VALUES ('a0000000-0000-0000-0000-000000001551', 1, '08:00', '16:00', '12:00', '12:30');
-- Also works Friday (crossing midnight), so the midnight-crossing
-- assertion below actually exercises the hours/range computation instead
-- of being starved by "nobody is scheduled that day" — this service
-- requires an employee, and no employee had ANY Friday row before this.
INSERT INTO public.employee_working_hours (employee_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000001551', 5, '17:00', '03:00');

-- Employee B: capable, assigned to Station A, works Monday 14:00-20:00, no break.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001552', 'slots-emp-b@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001552';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000001552');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001552', 'a0000000-0000-0000-0000-000000001510');
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001552', 'a0000000-0000-0000-0000-000000001520');
INSERT INTO public.employee_working_hours (employee_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000001552', 1, '14:00', '20:00');

-- Employee C: assigned and working, but NOT capable of the service.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001553', 'slots-emp-c@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001553';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000001553');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001553', 'a0000000-0000-0000-0000-000000001510');
INSERT INTO public.employee_working_hours (employee_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000001553', 1, '08:00', '20:00');

-- Employee D: capable, working, but assigned to the OTHER station.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001554', 'slots-emp-d@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001554';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000001554');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001554', 'a0000000-0000-0000-0000-000000001511');
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001554', 'a0000000-0000-0000-0000-000000001520');
INSERT INTO public.employee_working_hours (employee_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000001554', 1, '08:00', '20:00');

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001560', 'slots-customer@example.com');

-- ----------------------------------------------------------------------
-- Basic availability + duration.
-- ----------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:15:00'::timestamp
  ),
  'a normal weekday within the intersected station/service window offers a slot'
);
SELECT is(
  (SELECT slot_end - slot_start FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:15:00'::timestamp),
  interval '30 minutes',
  'each returned slot spans exactly the service duration'
);

-- ----------------------------------------------------------------------
-- Station closed / service closed.
-- ----------------------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-09'::date))::int,
  0,
  'station closed that day -> no slots, regardless of the service''s own hours'
);
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-10'::date))::int,
  0,
  'service closed that day -> no slots, even though the station itself is open'
);

-- ----------------------------------------------------------------------
-- Midnight crossing (Friday 20:00-01:00, within the station's 18:00-02:00).
-- ----------------------------------------------------------------------
SELECT ok(
  (SELECT max(slot_end AT TIME ZONE 'Africa/Cairo')::date FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-05'::date))
  > '2024-01-05'::date,
  'a midnight-crossing window offers slots that end on the following calendar day'
);

-- ----------------------------------------------------------------------
-- Employee capability + assignment (Monday 09:00 — only Employee A
-- qualifies: B not started yet, C not capable, D not assigned here).
-- ----------------------------------------------------------------------
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000001551'::uuid],
  'only the capable, assigned, on-shift employee (A) is offered for a 9am Monday slot'
);
SELECT ok(
  NOT (
    (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
     WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp)
    && ARRAY['a0000000-0000-0000-0000-000000001553'::uuid, 'a0000000-0000-0000-0000-000000001554'::uuid]
  ),
  'the incapable employee (C) and the employee assigned elsewhere (D) are never offered'
);

-- ----------------------------------------------------------------------
-- Employee break (A's break is 12:00-12:30; B hasn't started at noon).
-- ----------------------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 12:00:00'::timestamp)::int,
  0,
  'no employee is offered during Employee A''s break, so the slot is absent entirely'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 12:30:00'::timestamp
  ),
  'the slot right after the break ends is available again'
);

-- ----------------------------------------------------------------------
-- Both employees overlap in the afternoon (A until 16:00, B from 14:00).
-- ----------------------------------------------------------------------
SELECT ok(
  (SELECT candidate_employee_ids FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 15:00:00'::timestamp)
  @> ARRAY['a0000000-0000-0000-0000-000000001551'::uuid, 'a0000000-0000-0000-0000-000000001552'::uuid],
  'both on-shift employees are offered for a 3pm slot they''re both working'
);

-- ----------------------------------------------------------------------
-- Resource conflict: book Bay 1 for 10:00-10:30.
-- ----------------------------------------------------------------------
INSERT INTO public.bookings (customer_id, station_id, station_service_id, resource_id, time_range, status, price)
VALUES (
  'a0000000-0000-0000-0000-000000001560', 'a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001530',
  'a0000000-0000-0000-0000-000000001540',
  tstzrange('2024-01-08 10:00:00'::timestamp AT TIME ZONE 'Africa/Cairo', '2024-01-08 10:30:00'::timestamp AT TIME ZONE 'Africa/Cairo'),
  'CONFIRMED', 100
);

SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 10:00:00'::timestamp)::int,
  0,
  'the only bay is booked 10:00-10:30 -> that slot disappears even though Employee A is otherwise free'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 10:30:00'::timestamp
  ),
  'the bay is free again immediately after the conflicting booking ends'
);

-- ----------------------------------------------------------------------
-- Specific-employee filtering.
-- ----------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date, 'a0000000-0000-0000-0000-000000001551')
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 15:00:00'::timestamp
  ),
  'filtering for Employee A specifically still offers a 3pm slot A is working'
);
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date, 'a0000000-0000-0000-0000-000000001551')
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 17:00:00'::timestamp)::int,
  0,
  'filtering for Employee A excludes a 5pm slot A doesn''t work (A ends at 16:00)'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
    WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 17:00:00'::timestamp
  ),
  'without a preference, the same 5pm slot is still offered via Employee B'
);

-- ----------------------------------------------------------------------
-- Employee conflict: book Employee A for 09:00-09:30 (no resource needed
-- for this booking; only tests employee-side conflict handling).
-- ----------------------------------------------------------------------
INSERT INTO public.bookings (customer_id, station_id, station_service_id, employee_id, time_range, status, price)
VALUES (
  'a0000000-0000-0000-0000-000000001560', 'a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001530',
  'a0000000-0000-0000-0000-000000001551',
  tstzrange('2024-01-08 09:00:00'::timestamp AT TIME ZONE 'Africa/Cairo', '2024-01-08 09:30:00'::timestamp AT TIME ZONE 'Africa/Cairo'),
  'CONFIRMED', 100
);

SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date, 'a0000000-0000-0000-0000-000000001551')
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp)::int,
  0,
  'filtering for Employee A excludes 9am now that A has a conflicting booking'
);
SELECT is(
  (SELECT count(*) FROM public.get_available_slots('a0000000-0000-0000-0000-000000001510', 'a0000000-0000-0000-0000-000000001520', '2024-01-08'::date)
   WHERE (slot_start AT TIME ZONE 'Africa/Cairo') = '2024-01-08 09:00:00'::timestamp)::int,
  0,
  'with no preference, 9am is also gone — A was the only qualifying employee at that hour and is now busy'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
