-- ============================================================================
-- Global (non-Egypt-only) phone numbers + a sessionless "kiosk" path for the
-- public QR flow.
--
-- Part 1: phone numbers, platform-wide (profiles.phone — customers,
-- employees, managers, owners all share this one column/constraint).
--   - The CHECK constraint was Egypt-only (+20 then 10/11/12/15 then 8
--     digits). Relaxed to plain E.164 (RFC 3966 / ITU-T E.164: '+' followed
--     by 8-15 digits, first digit 1-9) — every existing Egyptian number
--     already matches E.164, so this is a pure relaxation, not a data
--     migration; nothing already stored needs to change or can stop
--     validating.
--   - No uniqueness on phone existed before this migration at all — dedup
--     was entirely delegated to Supabase Auth's own phone-uniqueness check,
--     which only applied when phone was literally the auth.users identifier
--     (see Part 2 for why that's changing). A real partial unique index
--     here is what "do not create a duplicate customer for an existing
--     phone number" now actually rests on, for every role, not just
--     customers.
--   - customer_phone_registered(): the read-only "does an account already
--     exist for this phone" check the public /join/[token] flow's
--     phone-first step needs, without needing a session to ask it. Returns
--     only a boolean — never a name or id — to keep the anon-reachable
--     enumeration surface as small as this kind of check can be (the same
--     shape as an ordinary "email already registered" check most signup
--     flows expose).
--
-- Part 2: kiosk_* — a sessionless path for the public QR flow to join a
-- queue or create a booking on behalf of a customer it has identified by
-- phone but never signs into a browser session. Why sessionless: continuing
-- an EXISTING customer's identity from an unauthenticated kiosk page has no
-- safe way to prove the visitor IS that customer (no password, no OTP —
-- Phase 7.4's job) — resetting their real password and signing in as them
-- would let anyone who merely knows their phone number impersonate them
-- with a full session (view/cancel their real bookings, etc.), which is
-- exactly the kind of broad privilege bypass this project's standing rules
-- forbid. So neither a new NOR a returning kiosk customer ever gets a
-- session; every privileged action goes through one of the narrowly-scoped
-- functions below instead, granted ONLY to service_role (never anon/
-- authenticated) and reachable only from apps/admin/src/app/join/[token]/
-- actions.ts, which is itself gated by QR_JOIN_TOKEN. Their own
-- authorization check is deliberately different from create_booking()'s/
-- join_queue()'s (owns_customer_row is meaningless with no session) — they
-- check instead that p_customer_id really is an existing CUSTOMER profile,
-- so this can't be pointed at a staff/employee id.
--
-- Neither create_booking() nor join_queue()'s actual availability/conflict/
-- position logic is duplicated for this: each is split into a thin,
-- authorization-only wrapper plus an internal `_..._core` function (never
-- granted to anyone directly — the same "internal building block" pattern
-- day_window_range()/available_resources_for_slot()/
-- available_employees_for_slot() already use), and both the existing
-- authenticated-only entry point and the new kiosk_* one call the same
-- core. create_booking()/join_queue()'s own signatures, grants, and
-- behavior for every existing authenticated caller are unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Part 1a: relax the phone CHECK constraint to plain E.164.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_check CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');

COMMENT ON COLUMN public.profiles.phone IS
  'E.164 (e.g. +201012345678, +14155552671) — normalized client-side by @gas-station/utils''s normalizeToE164() before it ever reaches here, for every role (customer/employee/manager/owner). Not Egypt-only. Unique (see profiles_phone_unique_idx below) among non-deleted rows.';

-- ----------------------------------------------------------------------------
-- Part 1b: phone uniqueness, platform-wide. Partial: NULL phones (an
-- employee with none on file yet) never collide, and a soft-deleted row
-- freeing its phone for reuse — same partial-index shape queue_entries'
-- own active-position uniqueness already uses.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX profiles_phone_unique_idx
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- Part 1c: customer_phone_registered() — read-only, anon-reachable.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_phone_registered(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE phone = p_phone AND role = 'CUSTOMER' AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_phone_registered(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Part 2a: create_booking() split into an internal core + the existing
-- authenticated-only wrapper (behavior/signature/grant unchanged) + the new
-- kiosk-only wrapper.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_booking_core(
  p_customer_id uuid,
  p_station_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_employee_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station_service_id uuid;
  v_duration_minutes integer;
  v_requires_employee boolean;
  v_requires_resource boolean;
  v_base_price numeric(10, 2);
  v_price_override numeric(10, 2);
  v_price numeric(10, 2);
  v_date date;
  v_dow smallint;
  v_station_window tstzrange;
  v_service_window tstzrange;
  v_slot tstzrange;
  v_resource_id uuid;
  v_employee_id uuid;
  v_booking public.bookings;
BEGIN
  IF EXISTS (SELECT 1 FROM public.services WHERE parent_service_id = p_service_id) THEN
    RAISE EXCEPTION 'this service is a package group and cannot be booked directly — choose one of its options';
  END IF;

  SELECT ss.id, sv.duration_minutes, sv.requires_employee_selection, sv.requires_resource,
         sv.base_price, ss.price_override
  INTO v_station_service_id, v_duration_minutes, v_requires_employee, v_requires_resource,
       v_base_price, v_price_override
  FROM public.station_services ss
  JOIN public.services sv ON sv.id = ss.service_id
  WHERE ss.station_id = p_station_id AND ss.service_id = p_service_id
    AND ss.is_active = true AND sv.is_active = true AND sv.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'this service is not currently offered at this station';
  END IF;

  v_price := COALESCE(v_price_override, v_base_price);
  v_date := (p_start_at AT TIME ZONE 'Africa/Cairo')::date;
  v_dow := EXTRACT(DOW FROM v_date);
  v_slot := tstzrange(p_start_at, p_start_at + make_interval(mins => v_duration_minutes), '[)');

  SELECT public.day_window_range(v_date, is_closed, is_24_hours, opens_at, closes_at)
  INTO v_station_window
  FROM public.station_operating_hours
  WHERE station_id = p_station_id AND day_of_week = v_dow;

  SELECT public.day_window_range(v_date, is_closed, is_24_hours, opens_at, closes_at)
  INTO v_service_window
  FROM public.service_operating_hours
  WHERE station_service_id = v_station_service_id AND day_of_week = v_dow;

  IF v_station_window IS NULL OR v_service_window IS NULL
     OR NOT (v_station_window @> v_slot AND v_service_window @> v_slot) THEN
    RAISE EXCEPTION 'the requested time is outside station or service operating hours';
  END IF;

  IF p_resource_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.available_resources_for_slot(v_station_service_id, v_slot) AS r WHERE r = p_resource_id
    ) THEN
      RAISE EXCEPTION 'the requested resource is not available for the requested time';
    END IF;
    v_resource_id := p_resource_id;
  ELSIF v_requires_resource THEN
    SELECT r INTO v_resource_id FROM public.available_resources_for_slot(v_station_service_id, v_slot) AS r LIMIT 1;
    IF v_resource_id IS NULL THEN
      RAISE EXCEPTION 'no resource is available for the requested time';
    END IF;
  END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.available_employees_for_slot(p_station_id, p_service_id, v_date, v_slot, p_employee_id) AS e
      WHERE e = p_employee_id
    ) THEN
      RAISE EXCEPTION 'the requested employee is not available for the requested time';
    END IF;
    v_employee_id := p_employee_id;
  ELSIF v_requires_employee THEN
    SELECT e INTO v_employee_id FROM public.available_employees_for_slot(p_station_id, p_service_id, v_date, v_slot) AS e LIMIT 1;
    IF v_employee_id IS NULL THEN
      RAISE EXCEPTION 'no employee is available for the requested time';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      customer_id, station_id, station_service_id, resource_id, employee_id,
      time_range, status, price, customer_notes
    ) VALUES (
      p_customer_id, p_station_id, v_station_service_id, v_resource_id, v_employee_id,
      v_slot, 'CONFIRMED', v_price, p_notes
    )
    RETURNING * INTO v_booking;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'this slot was just taken — please choose another time' USING ERRCODE = '23P01';
  END;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_customer_id uuid,
  p_station_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_employee_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.owns_customer_row(p_customer_id) OR public.is_station_staff(p_station_id)) THEN
    RAISE EXCEPTION 'not authorized to create this booking' USING ERRCODE = '42501';
  END IF;

  RETURN public._create_booking_core(
    p_customer_id, p_station_id, p_service_id, p_start_at, p_employee_id, p_resource_id, p_notes
  );
END;
$$;

-- Kiosk-only: same core, different (non-session) authorization — the caller
-- must be the service role, and p_customer_id must be a real, non-deleted
-- CUSTOMER profile (never staff/employee).
CREATE OR REPLACE FUNCTION public.kiosk_create_booking(
  p_customer_id uuid,
  p_station_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_employee_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_customer_id AND role = 'CUSTOMER' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not a valid customer account' USING ERRCODE = '42501';
  END IF;

  RETURN public._create_booking_core(
    p_customer_id, p_station_id, p_service_id, p_start_at, p_employee_id, p_resource_id, p_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kiosk_create_booking(uuid, uuid, uuid, timestamptz, uuid, uuid, text) TO service_role;

-- ----------------------------------------------------------------------------
-- Part 2b: join_queue() split the same way.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._join_queue_core(
  p_customer_id uuid,
  p_station_service_id uuid
)
RETURNS public.queue_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
  v_is_open boolean;
  v_next_position integer;
  v_entry public.queue_entries;
BEGIN
  SELECT q.id, q.is_open
  INTO v_queue_id, v_is_open
  FROM public.queues q
  WHERE q.station_service_id = p_station_service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no walk-in queue exists for this station service';
  END IF;

  IF NOT v_is_open THEN
    RAISE EXCEPTION 'this queue is currently closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.queue_entries
    WHERE queue_id = v_queue_id AND customer_id = p_customer_id AND status IN ('WAITING', 'CALLED')
  ) THEN
    RAISE EXCEPTION 'this customer already has an active entry in this queue';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_queue_id::text, 0));

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_position
  FROM public.queue_entries
  WHERE queue_id = v_queue_id AND status IN ('WAITING', 'CALLED');

  INSERT INTO public.queue_entries (queue_id, customer_id, position, status)
  VALUES (v_queue_id, p_customer_id, v_next_position, 'WAITING')
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_queue(
  p_customer_id uuid,
  p_station_service_id uuid
)
RETURNS public.queue_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station_id uuid;
BEGIN
  SELECT q.station_id INTO v_station_id
  FROM public.queues q
  WHERE q.station_service_id = p_station_service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no walk-in queue exists for this station service';
  END IF;

  IF NOT (public.owns_customer_row(p_customer_id) OR public.is_station_staff(v_station_id)) THEN
    RAISE EXCEPTION 'not authorized to join this queue' USING ERRCODE = '42501';
  END IF;

  RETURN public._join_queue_core(p_customer_id, p_station_service_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_join_queue(
  p_customer_id uuid,
  p_station_service_id uuid
)
RETURNS public.queue_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_customer_id AND role = 'CUSTOMER' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not a valid customer account' USING ERRCODE = '42501';
  END IF;

  RETURN public._join_queue_core(p_customer_id, p_station_service_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kiosk_join_queue(uuid, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Part 2c: ticket status (position/rank/estimated wait) — shared by
-- kiosk_join_queue's immediate response and later polling
-- (kiosk_queue_status), so the rank/wait computation lives in exactly one
-- place. rank = how many WAITING/CALLED entries are ahead in the same
-- queue; estimated_wait_minutes = rank * that service's duration, the same
-- "simple estimate" a human would make, not a scheduling prediction.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._queue_ticket_status(p_queue_entry_id uuid)
RETURNS TABLE (
  id uuid,
  queue_id uuid,
  position integer,
  status public.queue_status,
  rank integer,
  estimated_wait_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.queue_id,
    e.position,
    e.status,
    (
      SELECT count(*)::int FROM public.queue_entries e2
      WHERE e2.queue_id = e.queue_id AND e2.status IN ('WAITING', 'CALLED') AND e2.position < e.position
    ) AS rank,
    (
      SELECT count(*)::int FROM public.queue_entries e2
      WHERE e2.queue_id = e.queue_id AND e2.status IN ('WAITING', 'CALLED') AND e2.position < e.position
    ) * COALESCE(sv.duration_minutes, 15) AS estimated_wait_minutes
  FROM public.queue_entries e
  JOIN public.queues q ON q.id = e.queue_id
  JOIN public.station_services ss ON ss.id = q.station_service_id
  JOIN public.services sv ON sv.id = ss.service_id
  WHERE e.id = p_queue_entry_id;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_queue_status(p_queue_entry_id uuid)
RETURNS TABLE (
  id uuid,
  queue_id uuid,
  position integer,
  status public.queue_status,
  rank integer,
  estimated_wait_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public._queue_ticket_status(p_queue_entry_id);
$$;

GRANT EXECUTE ON FUNCTION public.kiosk_queue_status(uuid) TO service_role;
