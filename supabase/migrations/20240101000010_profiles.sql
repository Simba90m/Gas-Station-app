-- One row per authenticated user, extending Supabase's built-in auth.users.
-- The row is created automatically by a trigger on auth.users — see
-- 20240101000120_auth_handlers.sql — never inserted directly by the app.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'CUSTOMER',
  full_name text NOT NULL,
  -- Egyptian mobile format: +20 then 10/11/12/15 then 8 digits, e.g. +201012345678.
  phone text CHECK (phone IS NULL OR phone ~ '^\+20(10|11|12|15)[0-9]{8}$'),
  preferred_locale text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('en', 'ar')),
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.profiles IS
  'One row per auth.users row. role is the single source of truth for app-level authorization, enforced via RLS.';

CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX profiles_created_at_idx ON public.profiles (created_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
