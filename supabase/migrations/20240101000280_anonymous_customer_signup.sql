-- ============================================================================
-- Fixes handle_new_user() for Supabase anonymous sign-ins
-- (supabase.auth.signInAnonymously(), enabled for apps/mobile — see
-- supabase/config.toml's enable_anonymous_sign_ins for the full reasoning).
--
-- An anonymous auth.users row has both email AND raw_user_meta_data.full_name
-- NULL (nothing was collected yet — that's the entire point of anonymous
-- sign-in: let the customer act before proving who they are). The existing
-- handle_new_user() only ever falls back from metadata to
-- split_part(email, '@', 1) — never tried before because every prior
-- signup path (real signup, the admin-created synthetic/phone accounts,
-- the OTP-verified public join flow) always has at least one of the two.
-- With both NULL, split_part(NULL, ...) is NULL, and the INSERT into
-- profiles violates full_name's NOT NULL constraint — every anonymous
-- sign-in would fail outright without this fix.
--
-- Fix: one more COALESCE fallback to a literal placeholder. Nothing else
-- about this trigger changes — every existing signup path (which always
-- has metadata or an email) is completely unaffected, since COALESCE only
-- reaches this branch when both earlier ones are NULL.
--
-- Based on the CURRENT function body (as of
-- supabase/migrations/20240101000090_notifications_and_loyalty.sql, the
-- most recent of the two prior CREATE OR REPLACE FUNCTION
-- public.handle_new_user() definitions) — not the original one in
-- 20240101000070_auth_handlers.sql. CREATE OR REPLACE FUNCTION replaces
-- the ENTIRE body, so basing this on the older version would have
-- silently dropped the loyalty_accounts row every later migration since
-- 000090 has relied on existing for every new signup.
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
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1), 'Customer'),
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.customers (id) VALUES (NEW.id);
  INSERT INTO public.loyalty_accounts (customer_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;
