-- Phase 7.1: create_booking() — the only way a booking is ever inserted
-- through the API. Covers: authorization reimplementation (SECURITY
-- DEFINER bypasses RLS, so create_booking() must re-check it itself),
-- price resolution (station price_override wins over the catalog base
-- price), operating-hours re-validation, resource/employee double-booking
-- protection, and the tightened customer-cancel RLS from this same
-- migration (only PENDING/CONFIRMED can be cancelled by their own
-- customer).
--
-- On "concurrent booking race": create_booking() runs a friendly
-- availability pre-check before the INSERT, so two SEQUENTIAL calls for the
-- same employee/overlapping time are correctly rejected by that pre-check
-- (tested below) rather than by the raw EXCLUDE constraint's
-- exclusion_violation catch inside create_booking() — a single pgTAP
-- transaction can't produce two truly simultaneous sessions to exercise
-- that catch block directly. The underlying guarantee it falls back to is
-- the same EXCLUDE constraint already verified against raw INSERTs by
-- 001_booking_exclusion.test.sql; create_booking() performs an ordinary
-- INSERT into that same constrained table, so it inherits that guarantee
-- for a genuine concurrent race.
BEGIN;
SELECT plan(12);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000001610', 'Create Booking Station', 'محطة الحجز', 'Addr', 'عنوان', 31.2, 29.9);

-- Service A: no resource/employee required — isolates authorization/price/hours checks.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001620', 'Simple Service', 'خدمة بسيطة', 60, 20);
INSERT INTO public.station_services (id, station_id, service_id, price_override)
VALUES ('a0000000-0000-0000-0000-000000001630', 'a0000000-0000-0000-0000-000000001610', 'a0000000-0000-0000-0000-000000001620', 45);

-- Service B: resource required, no employee — isolates resource auto-assignment/conflict.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, requires_resource)
VALUES ('a0000000-0000-0000-0000-000000001621', 'Bay Service', 'خدمة المسار', 70, 20, true);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001631', 'a0000000-0000-0000-0000-000000001610', 'a0000000-0000-0000-0000-000000001621');
INSERT INTO public.service_resources (id, station_service_id, name_en, name_ar)
VALUES ('a0000000-0000-0000-0000-000000001640', 'a0000000-0000-0000-0000-000000001631', 'Bay 1', 'مسار 1');

-- Service C: employee required, no resource — isolates employee conflict.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, requires_employee_selection)
VALUES ('a0000000-0000-0000-0000-000000001622', 'Staffed Service', 'خدمة موظف', 90, 25, true);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001632', 'a0000000-0000-0000-0000-000000001610', 'a0000000-0000-0000-0000-000000001622');

INSERT INTO public.station_operating_hours (station_id, day_of_week, opens_at, closes_at)
VALUES ('a0000000-0000-0000-0000-000000001610', 1, '06:00', '22:00');
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
VALUES
  ('a0000000-0000-0000-0000-000000001630', 1, '06:00', '22:00'),
  ('a0000000-0000-0000-0000-000000001631', 1, '06:00', '22:00'),
  ('a0000000-0000-0000-0000-000000001632', 1, '06:00', '22:00');

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001651', 'create-booking-emp@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001651';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000001651');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001651', 'a0000000-0000-0000-0000-000000001610');
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001651', 'a0000000-0000-0000-0000-000000001622');
INSERT INTO public.employee_station_schedule (employee_id, station_id, day_of_week, starts_at, ends_at)
VALUES ('a0000000-0000-0000-0000-000000001651', 'a0000000-0000-0000-0000-000000001610', 1, '06:00', '22:00');

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001661', 'create-booking-customer1@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001662', 'create-booking-customer2@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001663', 'create-booking-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001663';
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001663', 'a0000000-0000-0000-0000-000000001610');

-- ----------------------------------------------------------------------
-- Customer books for themselves: succeeds, CONFIRMED, station price
-- override applied.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001661';

CREATE TEMP TABLE t_booking1 AS
SELECT * FROM public.create_booking(
  'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
  'a0000000-0000-0000-0000-000000001620',
  '2024-01-08 10:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
);

SELECT is(
  (SELECT status FROM t_booking1), 'CONFIRMED'::public.booking_status,
  'create_booking() returns a CONFIRMED booking'
);
SELECT is(
  (SELECT price FROM t_booking1), 45.00::numeric,
  'price reflects the station''s price_override, not the catalog base_price (60)'
);

-- ----------------------------------------------------------------------
-- Authorization: a plain customer cannot book on behalf of someone else —
-- SECURITY DEFINER bypasses RLS, so create_booking() must reject this itself.
-- ----------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000001662', 'a0000000-0000-0000-0000-000000001610',
       'a0000000-0000-0000-0000-000000001620', '2024-01-08 10:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  NULL::char(5), NULL,
  'a customer cannot create_booking() on behalf of a different customer'
);

-- Station staff CAN book on behalf of any customer at their own station.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001663';

CREATE TEMP TABLE t_booking2 AS
SELECT * FROM public.create_booking(
  'a0000000-0000-0000-0000-000000001662', 'a0000000-0000-0000-0000-000000001610',
  'a0000000-0000-0000-0000-000000001620', '2024-01-08 11:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
);

SELECT is((SELECT status FROM t_booking2), 'CONFIRMED'::public.booking_status, 'station staff can create a booking on behalf of a customer');
SELECT is((SELECT customer_id FROM t_booking2), 'a0000000-0000-0000-0000-000000001662'::uuid, 'the staff-created booking is recorded for the intended customer, not the staff member');

-- ----------------------------------------------------------------------
-- Operating hours re-validated at booking time (station closes at 22:00).
-- ----------------------------------------------------------------------
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001661';
SELECT throws_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
       'a0000000-0000-0000-0000-000000001620', '2024-01-08 23:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  NULL::char(5), NULL,
  'create_booking() rejects a time outside operating hours'
);

-- ----------------------------------------------------------------------
-- Resource double-booking: the only bay is taken by the first booking.
-- ----------------------------------------------------------------------
CREATE TEMP TABLE t_booking3 AS
SELECT * FROM public.create_booking(
  'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
  'a0000000-0000-0000-0000-000000001621', '2024-01-08 09:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
);
SELECT is((SELECT status FROM t_booking3), 'CONFIRMED'::public.booking_status, 'the first booking against the only bay succeeds');

SELECT throws_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
       'a0000000-0000-0000-0000-000000001621', '2024-01-08 09:10:00'::timestamp AT TIME ZONE 'Africa/Cairo'
     ) $$,
  NULL::char(5), NULL,
  'a second, overlapping booking against the same single bay is rejected'
);

-- ----------------------------------------------------------------------
-- Employee double-booking (the "concurrent booking race" proxy — see the
-- file header for what this does and doesn't prove).
-- ----------------------------------------------------------------------
CREATE TEMP TABLE t_booking4 AS
SELECT * FROM public.create_booking(
  'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
  'a0000000-0000-0000-0000-000000001622', '2024-01-08 14:00:00'::timestamp AT TIME ZONE 'Africa/Cairo',
  'a0000000-0000-0000-0000-000000001651'
);
SELECT is((SELECT status FROM t_booking4), 'CONFIRMED'::public.booking_status, 'the first booking against the requested employee succeeds');

SELECT throws_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
       'a0000000-0000-0000-0000-000000001622', '2024-01-08 14:10:00'::timestamp AT TIME ZONE 'Africa/Cairo',
       'a0000000-0000-0000-0000-000000001651'
     ) $$,
  NULL::char(5), NULL,
  'a second, overlapping booking against the same employee is rejected'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Cancellation restriction regression (this migration's RLS tightening):
-- a customer can no longer cancel a COMPLETED booking, but still can
-- cancel their own PENDING/CONFIRMED one.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001663'; -- staff
UPDATE public.bookings SET status = 'COMPLETED' WHERE id = (SELECT id FROM t_booking1);

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001661'; -- the owning customer
UPDATE public.bookings SET status = 'CANCELLED' WHERE id = (SELECT id FROM t_booking1);

SELECT is(
  (SELECT status FROM public.bookings WHERE id = (SELECT id FROM t_booking1)),
  'COMPLETED'::public.booking_status,
  'a customer cannot cancel their own COMPLETED booking — the update is silently filtered by RLS'
);

CREATE TEMP TABLE t_booking5 AS
SELECT * FROM public.create_booking(
  'a0000000-0000-0000-0000-000000001661', 'a0000000-0000-0000-0000-000000001610',
  'a0000000-0000-0000-0000-000000001620', '2024-01-08 12:00:00'::timestamp AT TIME ZONE 'Africa/Cairo'
);
UPDATE public.bookings SET status = 'CANCELLED' WHERE id = (SELECT id FROM t_booking5);

SELECT is(
  (SELECT status FROM public.bookings WHERE id = (SELECT id FROM t_booking5)),
  'CANCELLED'::public.booking_status,
  'a customer can still cancel their own PENDING/CONFIRMED booking'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
