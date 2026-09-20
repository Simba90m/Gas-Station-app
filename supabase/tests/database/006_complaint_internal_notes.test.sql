-- Verifies "customers must NOT see internal complaint notes" is a real
-- database-level guarantee (column privilege), not just an app-level
-- filter: a customer's own SELECT * cannot return internal_notes at all,
-- and only station staff can read it, only via the accessor function.
BEGIN;
SELECT plan(4);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000501', 'notes-customer@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000502', 'notes-station-mgr@example.com');
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000000502';

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000510', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);
INSERT INTO public.employee_station_assignments (profile_id, station_id)
VALUES ('a0000000-0000-0000-0000-000000000502', 'a0000000-0000-0000-0000-000000000510');

INSERT INTO public.complaints (id, customer_id, station_id, category, description, internal_notes)
VALUES ('a0000000-0000-0000-0000-000000000520', 'a0000000-0000-0000-0000-000000000501',
        'a0000000-0000-0000-0000-000000000510', 'OTHER', 'Test complaint', 'Sensitive internal note');

-- As the customer who filed it: SELECT internal_notes directly is a
-- permission error, not just an empty/null result — the column is not
-- exposed to `authenticated` at all (see the REVOKE in
-- 20240101000080_feedback_and_complaints.sql).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000501';

SELECT throws_ok(
  $$ SELECT internal_notes FROM public.complaints WHERE id = 'a0000000-0000-0000-0000-000000000520' $$,
  NULL::char(5), NULL,
  'the customer cannot SELECT the internal_notes column at all'
);
SELECT throws_ok(
  $$ SELECT public.get_complaint_internal_notes('a0000000-0000-0000-0000-000000000520') $$,
  NULL::char(5), NULL,
  'the customer cannot call get_complaint_internal_notes() for their own complaint'
);
SELECT is(
  (SELECT description FROM public.complaints WHERE id = 'a0000000-0000-0000-0000-000000000520'),
  'Test complaint',
  'the customer CAN see the rest of their own complaint (not a blanket row-level block)'
);

-- As the station manager for that complaint's station: the accessor
-- function returns the real note.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000502';

SELECT is(
  public.get_complaint_internal_notes('a0000000-0000-0000-0000-000000000520'),
  'Sensitive internal note',
  'station staff can read internal_notes through the accessor function'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
