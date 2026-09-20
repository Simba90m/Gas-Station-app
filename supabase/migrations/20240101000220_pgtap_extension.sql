-- ============================================================================
-- pgTAP: provides plan()/ok()/is()/throws_ok()/... used, unqualified, by all
-- 12 files in supabase/tests/database/ (65 assertion calls total).
--
-- Root cause of "function plan(integer) does not exist" when running
-- `npx supabase test db --linked`: no migration in this repo ever installs
-- pgTAP. Confirmed by grepping every migration file — only btree_gist and
-- pgcrypto are ever explicitly created. `supabase test db` against the
-- local Docker stack works because the CLI's own dev image comes with
-- pgTAP pre-installed; that bootstrapping is local-only and does nothing to
-- a hosted/linked project, so pgTAP has to be installed the same way every
-- other extension this project depends on is: through a version-controlled
-- migration.
--
-- Installed into `public` (not `extensions`, unlike pgcrypto in
-- 20240101000170_pgcrypto_extension.sql) on purpose: every one of the 65
-- pgTAP calls across the 12 test files is unqualified (SELECT plan(4),
-- ok(...), is(...), throws_ok(...), ...), and `public` is on every role's
-- default search_path — including the plain migration role, which does
-- NOT have `extensions` on its search_path (that gap is exactly what broke
-- pgcrypto earlier). Installing pgTAP into `extensions` would reproduce
-- that same bug for every test file. Targeting `public` instead keeps the
-- fix to this one migration rather than schema-qualifying all 65 call
-- sites for an arbitrary workaround.
--
-- Handled defensively rather than assumed: if Supabase ever pre-provisions
-- pgtap into some other schema on a given project (the same way it does
-- for pgcrypto), this relocates it with ALTER EXTENSION ... SET SCHEMA
-- instead of trying — and failing — to CREATE EXTENSION a second time.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgtap') THEN
    ALTER EXTENSION pgtap SET SCHEMA public;
  ELSE
    CREATE EXTENSION pgtap WITH SCHEMA public;
  END IF;
END $$;
