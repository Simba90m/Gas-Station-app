-- Phase 7.1: services.parent_service_id package/option grouping (e.g. "Car
-- Wash" -> "Basic"/"Premium"/"VIP") and the two-level depth guard from
-- check_service_hierarchy_depth(). Also verifies a service with children
-- can never be booked directly (create_booking()), and that a standalone
-- service and a leaf/option service both keep working with the ordinary
-- station_services infrastructure — no special-casing needed for either.
BEGIN;
SELECT plan(7);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

-- 1. A standalone service behaves exactly as before Phase 7.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001301', 'Oil Change', 'تغيير زيت', 200, 30);

SELECT is(
  (SELECT parent_service_id FROM public.services WHERE id = 'a0000000-0000-0000-0000-000000001301'),
  NULL::uuid,
  'a standalone service has parent_service_id NULL by default'
);

-- 2. A package group with one option under it.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001310', 'Car Wash', 'غسيل سيارات', 0, 1);

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, parent_service_id)
VALUES ('a0000000-0000-0000-0000-000000001311', 'Basic Wash', 'غسيل أساسي', 80, 20, 'a0000000-0000-0000-0000-000000001310');

SELECT is(
  (SELECT parent_service_id FROM public.services WHERE id = 'a0000000-0000-0000-0000-000000001311'),
  'a0000000-0000-0000-0000-000000001310'::uuid,
  'a package option correctly records its parent group'
);

-- 3. The option (already a child) cannot itself become a parent.
SELECT throws_ok(
  $$ INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes, parent_service_id)
     VALUES ('a0000000-0000-0000-0000-000000001312', 'Invalid Grandchild', 'غير صالح', 10, 10, 'a0000000-0000-0000-0000-000000001311') $$,
  NULL::char(5), NULL,
  'a package option cannot itself become a parent (max two levels)'
);

-- 4. A service that already has children cannot become someone else's child.
INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001320', 'Detailing', 'تلميع', 0, 1);

SELECT throws_ok(
  $$ UPDATE public.services SET parent_service_id = 'a0000000-0000-0000-0000-000000001320'
     WHERE id = 'a0000000-0000-0000-0000-000000001310' $$,
  NULL::char(5), NULL,
  'a service that already has children cannot itself become a child'
);

-- 5. A service cannot be its own parent.
SELECT throws_ok(
  $$ UPDATE public.services SET parent_service_id = id WHERE id = 'a0000000-0000-0000-0000-000000001301' $$,
  NULL::char(5), NULL,
  'a service cannot be its own parent'
);

-- 6. create_booking() refuses to book a package GROUP (has children) directly.
INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000001330', 'Package Test Station', 'محطة الاختبار', 'Addr', 'عنوان', 31.2, 29.9);

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001340', 'package-customer@example.com');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001340';

SELECT throws_ok(
  $$ SELECT public.create_booking(
       'a0000000-0000-0000-0000-000000001340', 'a0000000-0000-0000-0000-000000001330',
       'a0000000-0000-0000-0000-000000001310', now() + interval '1 day'
     ) $$,
  NULL::char(5), NULL,
  'create_booking() refuses to book a package GROUP service directly'
);

RESET ROLE;

-- 7. The leaf/option service works with the ordinary station_services
-- infrastructure exactly like a standalone service — no new table needed.
SET LOCAL ROLE postgres;
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001350', 'a0000000-0000-0000-0000-000000001330', 'a0000000-0000-0000-0000-000000001311');

SELECT is(
  (SELECT count(*) FROM public.station_services WHERE id = 'a0000000-0000-0000-0000-000000001350')::int,
  1,
  'a package option (leaf service) can be offered at a station exactly like a standalone service'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
