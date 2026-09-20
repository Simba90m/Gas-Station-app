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
SELECT plan(1);

SELECT diag(format(
  E'current_user=%s\nsession_user=%s\nis_superuser=%s\nrolbypassrls=%s\nstations_owner=%s\ncan_select_stations=%s\ncan_insert_stations=%s\nhas_usage_auth=%s\ncan_insert_auth_users=%s\nmember_of=%s',
  current_user,
  session_user,
  (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)::text,
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)::text,
  (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stations'),
  has_table_privilege(current_user, 'public.stations', 'SELECT')::text,
  has_table_privilege(current_user, 'public.stations', 'INSERT')::text,
  has_schema_privilege(current_user, 'auth', 'USAGE')::text,
  has_table_privilege(current_user, 'auth.users', 'INSERT')::text,
  (SELECT COALESCE(string_agg(r.rolname, ', '), '(none)')
     FROM pg_auth_members m
     JOIN pg_roles r ON r.oid = m.roleid
    WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user))
));

SELECT ok(true, 'diagnostic values printed above via diag()');

SELECT * FROM finish();
ROLLBACK;
