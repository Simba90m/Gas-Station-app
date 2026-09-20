-- Verifies employee_service_capabilities (Phase 6): visibility/write follow
-- the same "self, OWNER/MANAGER, or staff at an assigned station" rule as
-- employees_select/employees_update, and the table actually prevents
-- duplicate (employee, service) rows.
BEGIN;
SELECT plan(5);

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES
  ('a0000000-0000-0000-0000-000000001110', 'Cap Station A', 'محطة أ', 'Addr A', 'عنوان أ', 31.2, 29.9),
  ('a0000000-0000-0000-0000-000000001120', 'Cap Station B', 'محطة ب', 'Addr B', 'عنوان ب', 31.3, 30.0);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES
  ('a0000000-0000-0000-0000-000000001130', 'Test Service', 'خدمة اختبار', 80, 30),
  ('a0000000-0000-0000-0000-000000001180', 'Second Service', 'خدمة ثانية', 60, 20);

-- The employee, assigned only to Station A.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001140', 'cap-employee@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001140';
INSERT INTO public.employees (id) VALUES ('a0000000-0000-0000-0000-000000001140');
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001140', 'a0000000-0000-0000-0000-000000001110');

-- OWNER records the capability.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001150', 'cap-owner@example.com');
UPDATE public.profiles SET role = 'OWNER' WHERE id = 'a0000000-0000-0000-0000-000000001150';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001150';
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001140', 'a0000000-0000-0000-0000-000000001130');

SELECT is(
  (SELECT count(*) FROM public.employee_service_capabilities WHERE employee_id = 'a0000000-0000-0000-0000-000000001140')::int,
  1,
  'OWNER can record a capability for the employee'
);
SELECT throws_ok(
  $$ INSERT INTO public.employee_service_capabilities (employee_id, service_id) VALUES ('a0000000-0000-0000-0000-000000001140', 'a0000000-0000-0000-0000-000000001130') $$,
  NULL::char(5), NULL,
  'the same (employee, service) pair cannot be recorded twice'
);

-- Station A's manager (the employee's own assigned station): can see and
-- can write the capability.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001160', 'cap-station-a-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001160';
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001160', 'a0000000-0000-0000-0000-000000001110');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001160';
SELECT is(
  (SELECT count(*) FROM public.employee_service_capabilities WHERE employee_id = 'a0000000-0000-0000-0000-000000001140')::int,
  1,
  'station A''s manager can see the capability of an employee assigned to their station'
);

-- Station B's manager (NOT the employee's station): cannot see it, and
-- cannot write it.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001170', 'cap-station-b-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001170';
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000001170', 'a0000000-0000-0000-0000-000000001120');

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001170';
SELECT is(
  (SELECT count(*) FROM public.employee_service_capabilities WHERE employee_id = 'a0000000-0000-0000-0000-000000001140')::int,
  0,
  'station B''s manager (not the employee''s station) cannot see the capability'
);

-- Unlike UPDATE (which just silently matches zero rows under RLS), a
-- failing WITH CHECK on INSERT raises immediately.
SELECT throws_ok(
  $$ INSERT INTO public.employee_service_capabilities (employee_id, service_id) VALUES ('a0000000-0000-0000-0000-000000001140', 'a0000000-0000-0000-0000-000000001180') $$,
  NULL::char(5), NULL,
  'station B''s manager cannot record a capability for an employee not assigned to their station'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
