-- ============================================================================
-- Dual-channel (phone + email) OTP verification for customers, replacing
-- the sessionless kiosk_* RPC family and the synthetic ".invalid" email
-- workaround with real Supabase Auth sessions.
--
-- Why this supersedes the sessionless kiosk design
-- (supabase/migrations/20240101000260_global_phone_and_kiosk.sql): that
-- migration's own comment explains kiosk_* exists because "continuing an
-- EXISTING customer's identity from an unauthenticated kiosk page has no
-- safe way to prove the visitor IS that customer (no password, no OTP —
-- Phase 7.4's job)". OTP is exactly that missing proof. Once a customer
-- verifies a one-time code sent to their own phone, establishing a real
-- session for them is safe — auth.uid() genuinely is that customer, so the
-- EXISTING owns_customer_row()-gated create_booking()/join_queue() (used by
-- every other authenticated caller already) are the right entry points
-- again, not a service-role-only duplicate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1: profiles.email — a verified-only, denormalized mirror of
-- auth.users.email. Never directly client-writable (no column GRANT below,
-- matching how `phone` is also excluded from profiles_update_own's column
-- list) — the only way this column changes is the trigger in Part 2 seeing
-- Supabase itself confirm the address via OTP. That's what makes
-- profiles.email trustworthy as "a verified email" rather than just
-- whatever a client happened to type into an UPDATE.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN email text;

COMMENT ON COLUMN public.profiles.email IS
  'Mirrors auth.users.email, but only once Supabase has confirmed it (see sync_profile_email() below) — never set directly by the app. NULL means this customer has not completed email verification yet (new account mid-signup, or a legacy account from before this migration).';

CREATE UNIQUE INDEX profiles_email_unique_idx
  ON public.profiles (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Part 2: sync_profile_email() — mirrors handle_new_user()'s existing
-- SECURITY DEFINER pattern (20240101000070_auth_handlers.sql). Fires on
-- every auth.users update, but only actually writes profiles.email once
-- Supabase has set email_confirmed_at, i.e. only after the customer entered
-- the emailed OTP (supabase.auth.updateUser({ email }) followed by
-- verifyOtp({ email, token, type: 'email_change' })).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- ----------------------------------------------------------------------------
-- Part 3: customer_email_registered() — anon-reachable existence check,
-- mirrors customer_phone_registered() exactly (same boolean-only shape, same
-- reasoning: the smallest anon-enumeration surface this kind of check can
-- have).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE email = p_email AND role = 'CUSTOMER' AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_email_registered(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Part 4: get_queue_ticket_status() — an authenticated-session-authorized
-- wrapper around the existing _queue_ticket_status() internal helper (still
-- used unchanged), replacing kiosk_queue_status()'s service-role-only
-- access. Authorization mirrors create_booking()/join_queue() exactly:
-- the entry's own customer, or staff at that queue's station.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_queue_ticket_status(p_queue_entry_id uuid)
RETURNS TABLE (
  id uuid,
  queue_id uuid,
  queue_position integer,
  status public.queue_status,
  rank integer,
  estimated_wait_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.queue_entries qe
    JOIN public.queues q ON q.id = qe.queue_id
    WHERE qe.id = p_queue_entry_id
      AND (public.owns_customer_row(qe.customer_id) OR public.is_station_staff(q.station_id))
  ) THEN
    RAISE EXCEPTION 'not authorized to view this queue entry' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public._queue_ticket_status(p_queue_entry_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_queue_ticket_status(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Part 5: retire the sessionless kiosk_* RPC family. _create_booking_core,
-- _join_queue_core, and _queue_ticket_status (their shared internal
-- building blocks) are NOT touched — create_booking()/join_queue() still
-- use them, and now so does the public kiosk flow, via a real session.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.kiosk_create_booking(uuid, uuid, uuid, timestamptz, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.kiosk_join_queue(uuid, uuid);
DROP FUNCTION IF EXISTS public.kiosk_queue_status(uuid);
