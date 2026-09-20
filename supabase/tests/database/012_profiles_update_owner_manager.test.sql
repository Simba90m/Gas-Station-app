-- Verifies 20240101000210_profiles_update_owner_manager.sql: OWNER/MANAGER
-- can now edit another profile's contact info, but the pre-existing
-- column-level GRANT still blocks role/is_active from changing via a plain
-- UPDATE regardless — the new row-level policy only widens which ROWS are
-- reachable, not which COLUMNS a normal UPDATE can touch.
BEGIN;
SELECT plan(4);

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001210', 'contact-employee@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE', full_name = 'Old Name' WHERE id = 'a0000000-0000-0000-0000-000000001210';

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001220', 'contact-owner@example.com');
UPDATE public.profiles SET role = 'OWNER' WHERE id = 'a0000000-0000-0000-0000-000000001220';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001220';

UPDATE public.profiles SET full_name = 'New Name' WHERE id = 'a0000000-0000-0000-0000-000000001210';
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000001210'),
  'New Name',
  'OWNER can update another profile''s full_name'
);

SELECT throws_ok(
  $$ UPDATE public.profiles SET role = 'OWNER' WHERE id = 'a0000000-0000-0000-0000-000000001210' $$,
  NULL::char(5), NULL,
  'OWNER still cannot change role via a plain UPDATE — the column-level GRANT (not this new policy) is what actually blocks it'
);
SELECT is(
  (SELECT role FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000001210')::text,
  'EMPLOYEE',
  'role is unchanged after the rejected attempt'
);

-- An unrelated employee (neither self nor OWNER/MANAGER) still can't touch it.
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000001230', 'contact-other@example.com');
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001230';

SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001230';
UPDATE public.profiles SET full_name = 'Hijacked' WHERE id = 'a0000000-0000-0000-0000-000000001210';
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000001210'),
  'New Name',
  'an unrelated employee cannot edit someone else''s profile — value unchanged'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
