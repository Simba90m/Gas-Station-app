-- ============================================================================
-- Root cause of the production 500 on POST /auth/v1/signup for anonymous
-- users (23502: null value in column "full_name" of relation "profiles"):
--
-- handle_new_user() has been replaced (CREATE OR REPLACE FUNCTION) three
-- times total across this schema's history:
--   1. supabase/migrations/20240101000070_auth_handlers.sql — original:
--      inserts profiles + customers, full_name falls back from metadata to
--      split_part(email, '@', 1).
--   2. supabase/migrations/20240101000090_notifications_and_loyalty.sql —
--      adds the loyalty_accounts insert; full_name fallback unchanged.
--   3. supabase/migrations/20240101000280_anonymous_customer_signup.sql —
--      adds a THIRD COALESCE fallback ('Customer', a literal placeholder)
--      for exactly this case: an anonymous auth.users row
--      (supabase.auth.signInAnonymously(), apps/mobile) has both email AND
--      raw_user_meta_data.full_name NULL, so the first two fallbacks both
--      evaluate to NULL and the INSERT into profiles violated full_name's
--      NOT NULL constraint — the exact error in the Auth logs.
--
-- 000280's fix is correct and, verified locally, actually resolves this
-- exact failure (a direct anon-signup simulation against handle_new_user()
-- succeeds and creates profiles/customers/loyalty_accounts rows). If
-- production is still hitting this error, the fix in 000280 has not yet
-- been applied to that hosted project (`supabase db push` deploys
-- migrations; writing one in this repo does not, by itself, reach a
-- hosted database) — pushing this migration (which subsumes 000280's
-- fix; both apply cleanly regardless of push order) is what actually
-- resolves it there.
--
-- This migration's only change from 000280: the placeholder literal is
-- now 'Guest', not 'Customer' — the specific, clearly-documented value
-- requested for how an unverified anonymous customer's name displays
-- until they provide a real one (a later phase's phone/email
-- verification, same supabase.auth.updateUser() upgrade path already
-- used by the admin app's public join flow, is expected to overwrite
-- this placeholder with their real name via the ordinary profile-update
-- path — nothing here special-cases it). A new migration, not an edit to
-- 000280, since 000280 may already be applied in some environments and
-- CREATE OR REPLACE FUNCTION migrations must stay forward-only, the same
-- reasoning 000280's own header gives for not editing 000090's original.
--
-- Everything else is byte-for-byte identical to 000280: the profiles
-- INSERT's role/phone columns, the customers INSERT, and the
-- loyalty_accounts INSERT (000090's addition) are all preserved exactly —
-- confirmed by diffing this function body against 000280's before writing
-- this file.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    'CUSTOMER',
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1), 'Guest'),
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.customers (id) VALUES (NEW.id);
  INSERT INTO public.loyalty_accounts (customer_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;
