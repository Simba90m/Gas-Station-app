-- ============================================================================
-- Baseline privileges for every table/function created by later migrations.
--
-- Row Level Security policies decide which ROWS a role can see — they don't
-- grant the underlying SQL privilege to touch the table at all. Real
-- Supabase projects already configure exactly this before any user
-- migration runs; we set it up explicitly too so this migration set is
-- self-contained and correct on a plain Postgres database as well (not just
-- one Supabase has already bootstrapped).
--
-- Placed early (right after extensions/enums) so every table/function
-- created by later migrations in this project inherits these defaults —
-- ALTER DEFAULT PRIVILEGES only affects objects created *after* it runs.
-- Individual migrations still narrow specific tables/columns further with
-- their own REVOKE/GRANT (e.g. complaints.internal_notes, profiles.role).
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC (i.e. every role,
-- including anon) by default — revoke that default and require an explicit
-- GRANT per function instead, so a function is only reachable by whichever
-- role its own migration explicitly opens it up to.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
