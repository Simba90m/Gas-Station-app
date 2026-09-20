-- Verifies the first-admin bootstrap path added in
-- 20240101000160_bootstrap_first_owner.sql: a freshly signed-up user can
-- promote themselves to OWNER only while no OWNER/MANAGER exists yet, and
-- the door slams shut for everyone else the moment one does.
BEGIN;
SELECT plan(5);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000701', 'bootstrap-first@example.com');
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000702', 'bootstrap-second@example.com');

SET LOCAL ROLE authenticated;

-- No JWT claim set at all (simulates an unauthenticated/anon call) — must
-- be rejected before it ever looks at the profiles table.
SELECT throws_ok(
  $$ SELECT public.bootstrap_first_owner() $$,
  NULL::char(5), NULL,
  'an unauthenticated caller cannot bootstrap an owner'
);

-- The first signed-up user, with no OWNER/MANAGER in the system: succeeds.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000701';
SELECT is(
  public.bootstrap_first_owner(),
  'OWNER'::public.user_role,
  'the first caller is promoted to OWNER'
);
SELECT is(
  (SELECT role FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000701'),
  'OWNER'::public.user_role,
  'their profile row actually reflects OWNER'
);

-- A second signed-up user, now that an OWNER exists: refused.
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000702';
SELECT throws_ok(
  $$ SELECT public.bootstrap_first_owner() $$,
  NULL::char(5), NULL,
  'a second caller cannot bootstrap once an OWNER already exists'
);
SELECT is(
  (SELECT role FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000702'),
  'CUSTOMER'::public.user_role,
  'the second caller is left as CUSTOMER, untouched'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
