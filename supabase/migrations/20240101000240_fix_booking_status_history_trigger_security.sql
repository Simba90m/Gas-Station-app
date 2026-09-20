-- ============================================================================
-- Corrective migration: record_booking_status_change() must be SECURITY
-- DEFINER.
--
-- Root cause: booking_status_history's RLS (20240101000130_rls_bookings.sql)
-- is deliberately "written only by the record_booking_status_change trigger
-- ... no INSERT policy for authenticated, so the history can't be tampered
-- with via the API" — but the trigger function itself
-- (20240101000050_bookings.sql) was defined as a plain SECURITY INVOKER
-- function. A SECURITY INVOKER trigger executes with the privileges of
-- whoever performed the triggering INSERT/UPDATE on bookings, not the
-- table's owner — those are only the same thing when the caller literally
-- IS the owner (e.g. a direct top-level connection as postgres, which is
-- how every pgTAP fixture and the seed data have inserted/updated bookings
-- so far, via `SET LOCAL ROLE postgres`). A real `authenticated`
-- customer/staff member never is that owner, so the trigger's own INSERT
-- into booking_status_history was rejected by RLS: "new row violates row-
-- level security policy for table booking_status_history". This was a
-- latent bug in the original Phase 2 migration, not something Phase 7.1
-- introduced — it just had no code path to expose it until now: the
-- 016_create_booking.test.sql pgTAP file is the first thing to ever
-- perform a bookings INSERT/UPDATE as a genuine `authenticated` caller (via
-- create_booking()'s own INSERT, and via a direct staff status UPDATE).
-- The same gap would have broken any real admin UI status change once
-- Phase 7.2 started doing that directly through bookings_update_staff RLS.
--
-- Fix: make record_booking_status_change() SECURITY DEFINER with a pinned
-- search_path — the exact same established pattern already used by every
-- other function in this codebase that needs to act on an RLS-protected
-- table regardless of the calling role (handle_new_user,
-- current_user_role/is_owner_or_manager/is_station_staff/
-- is_assigned_employee/owns_customer_row, set_profile_role/
-- set_profile_active, bootstrap_first_owner). This is not a new pattern
-- introduced for convenience — it's the pattern this specific function
-- should have used from the start, given what its own policy comment
-- already claimed about it.
--
-- This does NOT weaken booking_status_history's security model or open any
-- new write path: `authenticated` still has no policy granting it direct
-- INSERT/UPDATE/DELETE on booking_status_history (only the pre-existing
-- SELECT policy exists), and the trigger only ever fires as a side effect
-- of a bookings INSERT/UPDATE that was already authorized by bookings' own
-- RLS (bookings_insert/bookings_update_customer_cancel/
-- bookings_update_staff) or by create_booking()'s own reimplemented
-- authorization check. This fixes the trigger's own internal write to
-- actually work for every calling context, matching what its policy
-- comment already claimed it did — it does not change who can trigger it
-- or what gets recorded (the function body, including `auth.uid()` for
-- changed_by, is unchanged).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.booking_status_history (booking_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
