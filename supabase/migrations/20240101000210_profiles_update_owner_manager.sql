-- ============================================================================
-- Lets OWNER/MANAGER update another profile's contact info (full_name,
-- phone, preferred_locale, avatar_url) — needed for Phase 6's "update
-- employee contact information." profiles_update_own
-- (20240101000110_rls_identity.sql) only ever admitted id = auth.uid(), so
-- nobody but the employee themselves could edit their own name/phone.
--
-- This is safe to add without touching role/is_active protection at all:
-- those stay reachable only through set_profile_role()/set_profile_active()
-- regardless of which RLS policy admits a row, because the column-level
-- GRANT already in place (`GRANT UPDATE (full_name, phone,
-- preferred_locale, avatar_url) ON profiles TO authenticated`) is what
-- actually restricts which columns a plain UPDATE can touch — an
-- additional permissive USING/WITH CHECK policy only decides which ROWS
-- are reachable, not which columns. Postgres combines multiple permissive
-- policies for the same command with OR, so this is purely additive to
-- profiles_update_own, not a replacement for it.
-- ============================================================================
CREATE POLICY profiles_update_owner_manager ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_owner_or_manager())
  WITH CHECK (public.is_owner_or_manager());
