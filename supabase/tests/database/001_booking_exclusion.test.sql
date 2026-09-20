-- Verifies the double-booking prevention required by the project brief:
-- Postgres itself (not application code) must reject an overlapping booking
-- for the same employee or the same resource/bay.
BEGIN;
SELECT plan(4);

-- Privileged fixture setup (auth.users + arbitrary public-table inserts):
-- npx supabase test db --linked connects as cli_login_postgres, which has
-- no direct grants on these tables (unlike local Docker, where the
-- connecting role is a real superuser). It IS a member of postgres, so
-- SET LOCAL ROLE assumes that membership for fixture setup only, scoped to
-- this transaction — reverts automatically on ROLLBACK, no GRANT involved.
SET LOCAL ROLE postgres;

-- Fixtures
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000001', 'test-owner@example.com');
UPDATE public.profiles SET role = 'OWNER' WHERE id = 'a0000000-0000-0000-0000-000000000001';

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000002', 'test-employee@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000000002';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000000002');

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000003', 'test-customer@example.com');

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000010', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);

INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010');

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, requires_resource)
VALUES ('a0000000-0000-0000-0000-000000000020', 'Test Wash', 'غسيل اختبار', 100, 30, true);

INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000020');

INSERT INTO public.service_resources (id, station_service_id, name_en, name_ar)
VALUES ('a0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000030', 'Bay 1', 'مسار 1');

INSERT INTO public.bookings (customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
VALUES (
  'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
  'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000040',
  'a0000000-0000-0000-0000-000000000002',
  tstzrange('2024-06-15 12:00:00+02', '2024-06-15 12:30:00+02'), 'CONFIRMED', 100
);

-- Same employee, overlapping time -> rejected with Postgres's
-- exclusion_violation SQLSTATE (23P01). The 4-arg throws_ok form (with the
-- errcode cast to char(5)) checks the SQLSTATE specifically and skips
-- matching the message text (NULL) — pgTAP's 2/3-arg text forms instead
-- match against the error MESSAGE, which isn't what we want to pin down.
SELECT throws_ok(
  $$ INSERT INTO public.bookings (customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
     VALUES ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
             'a0000000-0000-0000-0000-000000000030', NULL, 'a0000000-0000-0000-0000-000000000002',
             tstzrange('2024-06-15 12:15:00+02', '2024-06-15 12:45:00+02'), 'CONFIRMED', 100) $$,
  '23P01'::char(5), NULL,
  'overlapping booking for the same employee is rejected by the database'
);

-- Same resource/bay, overlapping time -> rejected.
SELECT throws_ok(
  $$ INSERT INTO public.bookings (customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
     VALUES ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
             'a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000040', NULL,
             tstzrange('2024-06-15 12:15:00+02', '2024-06-15 12:45:00+02'), 'CONFIRMED', 100) $$,
  '23P01'::char(5), NULL,
  'overlapping booking for the same resource is rejected by the database'
);

-- Same employee, NON-overlapping time -> allowed.
SELECT lives_ok(
  $$ INSERT INTO public.bookings (customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
     VALUES ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
             'a0000000-0000-0000-0000-000000000030', NULL, 'a0000000-0000-0000-0000-000000000002',
             tstzrange('2024-06-15 13:00:00+02', '2024-06-15 13:30:00+02'), 'CONFIRMED', 100) $$,
  'non-overlapping booking for the same employee is allowed'
);

-- Same employee/resource, overlapping time, but the earlier booking is
-- CANCELLED -> allowed (the exclusion constraint only applies to active
-- bookings).
UPDATE public.bookings SET status = 'CANCELLED'
WHERE employee_id = 'a0000000-0000-0000-0000-000000000002'
  AND time_range = tstzrange('2024-06-15 12:00:00+02', '2024-06-15 12:30:00+02');

SELECT lives_ok(
  $$ INSERT INTO public.bookings (customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
     VALUES ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000010',
             'a0000000-0000-0000-0000-000000000030', NULL, 'a0000000-0000-0000-0000-000000000002',
             tstzrange('2024-06-15 12:00:00+02', '2024-06-15 12:30:00+02'), 'CONFIRMED', 100) $$,
  'a cancelled booking does not block a new booking for the same slot'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
