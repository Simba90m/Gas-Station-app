-- Anonymous customer sign-in support for apps/mobile
-- (supabase/migrations/20240101000280_anonymous_customer_signup.sql,
-- superseded — same fix, placeholder literal changed 'Customer' ->
-- 'Guest' — by supabase/migrations/20240101000290_anonymous_signup_guest_placeholder.sql).
--
-- Covers: an anonymous auth.users row (no email, no raw_user_meta_data)
-- no longer crashes handle_new_user() (full_name NOT NULL would otherwise
-- be violated — the exact 23502 error seen in production Auth logs before
-- 000280/000290 were deployed), a profile IS created for that user with a
-- valid non-null full_name (the 'Guest' placeholder), and the
-- customers/loyalty_accounts rows are created exactly as they are for
-- every other signup path. Also covers that a normal signup (with a real
-- email) is completely unaffected by the extra COALESCE fallback — this
-- doubles as regression coverage for a real bug caught while writing
-- 000280: basing the fix on the WRONG prior version of handle_new_user()
-- (supabase/migrations/20240101000070_auth_handlers.sql's original,
-- instead of the one supabase/migrations/20240101000090_notifications_and_loyalty.sql
-- had already replaced it with) would have silently stopped creating
-- loyalty_accounts for every future signup.
BEGIN;
SELECT plan(10);

SET LOCAL ROLE postgres;

-- ----------------------------------------------------------------------
-- 1. Anonymous sign-in: no email, no metadata at all. Does not fail, and
-- a profile row is actually created (not just "no error").
-- ----------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO auth.users (id, email, is_anonymous)
     VALUES ('a0000000-0000-0000-0000-000000021010', NULL, true) $$,
  'an anonymous auth.users insert (no email, no metadata) does not crash handle_new_user()'
);

SELECT is(
  (SELECT count(*) FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021010')::int, 1,
  'a profile row is created for the anonymous user'
);

SELECT is(
  (SELECT role FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021010'),
  'CUSTOMER'::public.user_role,
  'the anonymous customer gets role=CUSTOMER'
);

SELECT isnt(
  (SELECT full_name FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021010'),
  NULL,
  'the anonymous customer''s full_name is not null (the NOT NULL constraint that used to fail this insert)'
);

SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021010'),
  'Guest',
  'the anonymous customer gets the literal ''Guest'' full_name placeholder (both metadata and email are NULL)'
);

SELECT is(
  (SELECT phone FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021010'),
  NULL::text,
  'the anonymous customer has no phone yet'
);

SELECT is(
  (SELECT count(*) FROM public.customers WHERE id = 'a0000000-0000-0000-0000-000000021010')::int, 1,
  'a customers row is created for the anonymous sign-in, same as any other signup'
);

SELECT is(
  (SELECT count(*) FROM public.loyalty_accounts WHERE customer_id = 'a0000000-0000-0000-0000-000000021010')::int, 1,
  'a loyalty_accounts row is created for the anonymous sign-in — regression coverage for the bug above'
);

-- ----------------------------------------------------------------------
-- 2. A normal signup (real email, no full_name in metadata) is
-- unaffected — still derives full_name from the email's local part, same
-- as before this migration.
-- ----------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000021020', 'anon-signup-regression@example.com');

SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021020'),
  'anon-signup-regression',
  'a normal email-based signup still derives full_name from the email local part, unaffected by the anonymous fallback'
);

-- ----------------------------------------------------------------------
-- 3. Metadata full_name still takes priority over both the email and the
-- 'Guest' fallback, same as before.
-- ----------------------------------------------------------------------
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('a0000000-0000-0000-0000-000000021030', 'has-metadata@example.com', '{"full_name": "Metadata Name"}'::jsonb);

SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000021030'),
  'Metadata Name',
  'raw_user_meta_data.full_name still takes priority over the email/placeholder fallbacks'
);

SELECT * FROM finish();
ROLLBACK;
