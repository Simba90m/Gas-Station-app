-- ============================================================================
-- bootstrap_first_owner: promotes the CALLING authenticated user to OWNER,
-- but only when no OWNER or MANAGER exists anywhere in the system yet.
--
-- Problem this solves: handle_new_user() (20240101000070_auth_handlers.sql)
-- always creates new profiles as CUSTOMER — deliberately, so nothing
-- supplied at signup can grant a role above CUSTOMER. Promoting anyone
-- further requires set_profile_role(), which requires the CALLER to
-- already be OWNER/MANAGER. Local dev sidesteps this by promoting the
-- first OWNER directly as the postgres superuser while seeding (see
-- supabase/seed/02_staff.sql) — but a freshly created real Supabase
-- project has no seed data, so nobody could ever call set_profile_role()
-- to create the very first admin.
--
-- This function is the safe, RLS-preserving equivalent for a real project:
-- it self-locks the moment a single OWNER or MANAGER exists, after which
-- every further promotion goes through set_profile_role() exactly as
-- before. No email or UUID is hardcoded — it always acts on whoever is
-- calling it (auth.uid()). See README.md "First admin on a real project"
-- for how to invoke it (scripts/bootstrap-first-owner.mjs).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_first_owner()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_role public.user_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'must be called by an authenticated user';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role IN ('OWNER', 'MANAGER')) THEN
    RAISE EXCEPTION 'an OWNER or MANAGER already exists; ask them to grant access via set_profile_role()';
  END IF;

  UPDATE public.profiles SET role = 'OWNER' WHERE id = auth.uid()
  RETURNING role INTO v_new_role;

  IF v_new_role IS NULL THEN
    RAISE EXCEPTION 'no profile found for the current user';
  END IF;

  RETURN v_new_role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner() TO authenticated;
