-- TEMPORARY DIAGNOSTIC — not part of the numbered test suite, delete once
-- the "permission denied" investigation is resolved.
--
-- `npx supabase test db --linked` connects to the hosted project directly
-- over Postgres wire protocol, using whichever role is embedded in the
-- linked project's connection string. We don't have credentials to inspect
-- that connection from outside — this file asks the connection itself, via
-- pgTAP's diag() (which prints to the test output regardless of pass/fail),
-- so the answer comes from the real linked database, not a guess.
BEGIN;
SELECT plan(3);

-- NOTE: a first version of this file also checked
-- has_table_privilege(current_user, 'auth.users', 'INSERT') — that itself
-- failed with "permission denied for schema auth", because casting a
-- schema-qualified name like 'auth.users' to regclass requires USAGE on
-- that schema just to resolve it. Removed here, but that failure is
-- itself confirmed evidence: this role has no USAGE on `auth` at all.
SELECT diag(format(
  E'current_user=%s\nsession_user=%s\nis_superuser=%s\nrolbypassrls=%s\nstations_owner=%s\ncan_select_stations=%s\ncan_insert_stations=%s\nhas_usage_auth=%s\nmember_of=%s',
  current_user,
  session_user,
  (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)::text,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)::text,
  (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stations'),
  has_table_privilege(current_user, 'public.stations', 'SELECT')::text,
  has_table_privilege(current_user, 'public.stations', 'INSERT')::text,
  has_schema_privilege(current_user, 'auth', 'USAGE')::text,
  (SELECT COALESCE(string_agg(r.rolname, ', '), '(none)')
     FROM pg_auth_members m
     JOIN pg_roles r ON r.oid = m.roleid
    WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user))
));

SELECT ok(true, 'diagnostic values printed above via diag()');

-- Confirm the actual candidate fix mechanism works, rather than assuming
-- pg_auth_members membership implies SET ROLE will succeed.
SET LOCAL ROLE postgres;

SELECT diag(format(
  E'--- after SET LOCAL ROLE postgres ---\ncurrent_user=%s\ncan_select_stations=%s\ncan_insert_stations=%s\nhas_usage_auth=%s',
  current_user,
  has_table_privilege(current_user, 'public.stations', 'SELECT')::text,
  has_table_privilege(current_user, 'public.stations', 'INSERT')::text,
  has_schema_privilege(current_user, 'auth', 'USAGE')::text
));

-- Metadata checks can say "yes" while something else (a trigger, a
-- downstream constraint) still fails — so actually do the two operations
-- every one of the 12 test files' fixtures need, for real, inside this
-- rolled-back transaction.
SELECT lives_ok(
  $$ INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
     VALUES ('a0000000-0000-0000-0000-00000000dd01', 'Diag Station', 'محطة تشخيص', 'Addr', 'عنوان', 31.2, 29.9) $$,
  'SET LOCAL ROLE postgres can insert into public.stations'
);
SELECT lives_ok(
  $$ INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-00000000dd02', 'diag-fixture@example.com') $$,
  'SET LOCAL ROLE postgres can insert into auth.users (and the handle_new_user trigger fires without error)'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
