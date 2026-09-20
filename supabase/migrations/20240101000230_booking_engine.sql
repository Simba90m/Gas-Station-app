-- ============================================================================
-- Phase 7.1: booking & availability engine.
--
-- Adds, on top of the existing schema (nothing below recreates anything
-- that already works — see docs/DATABASE_DESIGN.md and the Phase 7 design
-- discussion for the full audit):
--   1. services.parent_service_id — lightweight package/option grouping
--      (e.g. "Car Wash" -> "Basic"/"Premium"/"VIP"), reusing station_services/
--      service_resources/service_operating_hours/employee_service_capabilities
--      unchanged for every leaf (option) service, exactly as for a standalone
--      service. A service with children is organizational only, never
--      booked directly.
--   2. A depth-limiting trigger capping the hierarchy at exactly two levels.
--   3. queue_entries.converted_booking_id — the (schema-only, for 7.1) link
--      a future walk-in -> booking conversion (Phase 7.4) will use.
--   4. Tightened bookings_update_customer_cancel RLS: a customer can only
--      cancel while PENDING/CONFIRMED, not after CHECKED_IN/IN_PROGRESS/
--      COMPLETED.
--   5. A booking status transition guard trigger.
--   6. day_window_range() / available_resources_for_slot() /
--      available_employees_for_slot() — shared building blocks.
--   7. get_available_slots() and create_booking() — the two SECURITY
--      DEFINER RPCs the guided booking journey and admin booking UI call;
--      no availability logic is ever duplicated in application code.
--
-- The existing EXCLUDE USING gist constraints on bookings (employee_id/
-- resource_id vs. time_range, from 20240101000050_bookings.sql) remain the
-- final race-condition authority — create_booking() does not add its own
-- locking, it relies on the same constraint that already protects direct
-- inserts, verified by 001_booking_exclusion.test.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. services.parent_service_id
-- ----------------------------------------------------------------------------
ALTER TABLE public.services
  ADD COLUMN parent_service_id uuid REFERENCES public.services (id) ON DELETE SET NULL;

CREATE INDEX services_parent_service_id_idx ON public.services (parent_service_id);

COMMENT ON COLUMN public.services.parent_service_id IS
  'NULL for a standalone service or a package group ("Car Wash"); set for a package option ("Basic"/"Premium"/"VIP"). A service with children is never itself bookable — enforced in get_available_slots()/create_booking(), not by a bidirectional DB constraint (see check_service_hierarchy_depth for the one invariant that IS enforced here: max two levels).';

-- ----------------------------------------------------------------------------
-- 2. Depth-limiting trigger: exactly two levels (group -> option). Mirrors
-- the existing check_employee_role/check_assignment_role/check_customer_role
-- pattern already used in this codebase for single-column integrity rules
-- that a plain CHECK constraint can't express (needs to look at other rows).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_service_hierarchy_depth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_service_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_service_id = NEW.id THEN
    RAISE EXCEPTION 'a service cannot be its own parent (id %)', NEW.id;
  END IF;

  -- The target parent must itself be top-level (no parent of its own) —
  -- a package option can never become a parent.
  IF EXISTS (
    SELECT 1 FROM public.services
    WHERE id = NEW.parent_service_id AND parent_service_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'parent_service_id (%) is itself a child/package service — it cannot become a parent', NEW.parent_service_id;
  END IF;

  -- This service must not already have children — a group cannot also
  -- become someone else's child.
  IF EXISTS (SELECT 1 FROM public.services WHERE parent_service_id = NEW.id) THEN
    RAISE EXCEPTION 'service % already has child services and cannot itself become a child', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_service_hierarchy_depth
  BEFORE INSERT OR UPDATE OF parent_service_id ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.check_service_hierarchy_depth();

-- ----------------------------------------------------------------------------
-- 3. queue_entries.converted_booking_id (schema only in 7.1 — the actual
-- walk-in -> booking conversion RPC/UI is Phase 7.4).
-- ----------------------------------------------------------------------------
ALTER TABLE public.queue_entries
  ADD COLUMN converted_booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL;

CREATE INDEX queue_entries_converted_booking_id_idx ON public.queue_entries (converted_booking_id);

-- ----------------------------------------------------------------------------
-- 4. Tighten customer-cancel RLS: only while PENDING/CONFIRMED. Previously
-- the USING clause only checked ownership, so a customer could technically
-- attempt to "cancel" an already-COMPLETED/IN_PROGRESS/CHECKED_IN booking
-- (the WITH CHECK only restricted the *target* status).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS bookings_update_customer_cancel ON public.bookings;
CREATE POLICY bookings_update_customer_cancel ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.owns_customer_row(customer_id) AND status IN ('PENDING', 'CONFIRMED'))
  WITH CHECK (public.owns_customer_row(customer_id) AND status = 'CANCELLED');

-- ----------------------------------------------------------------------------
-- 5. Booking status transition guard.
--
-- Forward movement through PENDING -> CONFIRMED -> CHECKED_IN -> IN_PROGRESS
-- -> COMPLETED is allowed to SKIP steps (e.g. CONFIRMED -> COMPLETED for a
-- fast walk-in that never used CHECKED_IN/IN_PROGRESS — already exercised by
-- 005_feedback_rules.test.sql) but never to move backward. CANCELLED is
-- reachable from any non-terminal state. NO_SHOW is reachable only from
-- CONFIRMED/CHECKED_IN (a booking that's already IN_PROGRESS means the
-- customer showed up). Once COMPLETED/CANCELLED/NO_SHOW, a booking cannot
-- transition again. Only guards UPDATE (not INSERT) — the initial status on
-- creation is a business-logic choice for create_booking()/seed data to
-- make, not a "transition" in this sense, and seed data legitimately
-- inserts historical bookings directly at various statuses.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_booking_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order text[] := ARRAY['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'];
  v_old_rank int;
  v_new_rank int;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW') THEN
    RAISE EXCEPTION 'booking % is in a terminal state (%) and cannot transition to %', OLD.id, OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'NO_SHOW' THEN
    IF OLD.status NOT IN ('CONFIRMED', 'CHECKED_IN') THEN
      RAISE EXCEPTION 'invalid booking status transition: % -> NO_SHOW (only CONFIRMED/CHECKED_IN can become NO_SHOW)', OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  v_old_rank := array_position(v_order, OLD.status::text);
  v_new_rank := array_position(v_order, NEW.status::text);

  IF v_old_rank IS NULL OR v_new_rank IS NULL OR v_new_rank <= v_old_rank THEN
    RAISE EXCEPTION 'invalid booking status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_booking_status_transition
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_status_transition();

-- ----------------------------------------------------------------------------
-- 6. Shared building blocks.
-- ----------------------------------------------------------------------------

-- Turns one *_operating_hours-shaped row (is_closed, is_24_hours,
-- starts/opens_at, ends/closes_at) into a real tstzrange anchored to a
-- specific calendar date, handling midnight-crossing (ends <= starts means
-- the window runs into the next calendar day) the same way every other part
-- of this schema already does. NULL means "no window that day" (closed, or
-- no row at all when called with is_closed=true by the caller). Anchored
-- explicitly to Africa/Cairo rather than relying on the connection's
-- session timezone, since this determines which real day/time a customer
-- means by "Saturday" regardless of what runs the query.
CREATE OR REPLACE FUNCTION public.day_window_range(
  p_date date,
  p_is_closed boolean,
  p_is_24_hours boolean,
  p_starts time,
  p_ends time
)
RETURNS tstzrange
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_is_closed THEN NULL
    WHEN p_is_24_hours THEN tstzrange(
      p_date::timestamp AT TIME ZONE 'Africa/Cairo',
      (p_date + 1)::timestamp AT TIME ZONE 'Africa/Cairo',
      '[)'
    )
    WHEN p_starts IS NULL OR p_ends IS NULL THEN NULL
    WHEN p_ends > p_starts THEN tstzrange(
      (p_date + p_starts) AT TIME ZONE 'Africa/Cairo',
      (p_date + p_ends) AT TIME ZONE 'Africa/Cairo',
      '[)'
    )
    ELSE tstzrange(
      (p_date + p_starts) AT TIME ZONE 'Africa/Cairo',
      ((p_date + 1) + p_ends) AT TIME ZONE 'Africa/Cairo',
      '[)'
    )
  END;
$$;

-- Resources belonging to a station's offering of a service that are
-- AVAILABLE and have no overlapping active booking for the given slot.
CREATE OR REPLACE FUNCTION public.available_resources_for_slot(
  p_station_service_id uuid,
  p_slot tstzrange
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  SELECT r.id
  FROM public.service_resources r
  WHERE r.station_service_id = p_station_service_id
    AND r.status = 'AVAILABLE'
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.resource_id = r.id
        AND b.status NOT IN ('CANCELLED', 'NO_SHOW')
        AND b.time_range && p_slot
    )
  ORDER BY r.name_en;
$$;

-- Employees assigned to the station, capable of the (global) service,
-- inside their working hours minus break for that date, with no
-- overlapping active booking. employee_working_hours (the schedule), not
-- shifts (real-time attendance), is what advance availability reasons
-- about — see the Phase 7 design discussion for why. p_employee_id narrows
-- to just that employee when given (used both to validate an explicit
-- preference and, when NULL, to auto-select).
CREATE OR REPLACE FUNCTION public.available_employees_for_slot(
  p_station_id uuid,
  p_service_id uuid,
  p_date date,
  p_slot tstzrange,
  p_employee_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  WITH candidates AS (
    SELECT
      e.id,
      public.day_window_range(p_date, ewh.is_closed, ewh.is_24_hours, ewh.starts_at, ewh.ends_at) AS working_window,
      public.day_window_range(p_date, ewh.break_starts_at IS NULL, false, ewh.break_starts_at, ewh.break_ends_at) AS break_window
    FROM public.employees e
    JOIN public.employee_station_assignments esa ON esa.profile_id = e.id AND esa.station_id = p_station_id
    JOIN public.employee_service_capabilities esc ON esc.employee_id = e.id AND esc.service_id = p_service_id
    JOIN public.employee_working_hours ewh ON ewh.employee_id = e.id AND ewh.day_of_week = EXTRACT(DOW FROM p_date)
    WHERE e.is_active = true
      AND (p_employee_id IS NULL OR e.id = p_employee_id)
  )
  SELECT c.id
  FROM candidates c
  WHERE c.working_window IS NOT NULL
    AND c.working_window @> p_slot
    AND (c.break_window IS NULL OR NOT (c.break_window && p_slot))
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.employee_id = c.id
        AND b.status NOT IN ('CANCELLED', 'NO_SHOW')
        AND b.time_range && p_slot
    )
  ORDER BY c.id;
$$;

-- ----------------------------------------------------------------------------
-- 7a. get_available_slots(): read-only. Returns genuinely bookable slots
-- only — never a padded list of disabled ones; the caller (guided journey)
-- shows exactly what this returns.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_station_id uuid,
  p_service_id uuid,
  p_date date,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  slot_start timestamptz,
  slot_end timestamptz,
  candidate_employee_ids uuid[],
  candidate_resource_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_station_service_id uuid;
  v_duration_minutes integer;
  v_requires_employee boolean;
  v_requires_resource boolean;
  v_dow smallint;
  v_station_window tstzrange;
  v_service_window tstzrange;
  v_window tstzrange;
  v_granularity CONSTANT interval := interval '15 minutes';
  v_slot_start timestamptz;
  v_slot tstzrange;
  v_duration interval;
  v_resource_ids uuid[];
  v_employee_ids uuid[];
BEGIN
  -- A package group (has children) is organizational only, never bookable.
  IF EXISTS (SELECT 1 FROM public.services WHERE parent_service_id = p_service_id) THEN
    RETURN;
  END IF;

  SELECT ss.id, sv.duration_minutes, sv.requires_employee_selection, sv.requires_resource
  INTO v_station_service_id, v_duration_minutes, v_requires_employee, v_requires_resource
  FROM public.station_services ss
  JOIN public.services sv ON sv.id = ss.service_id
  WHERE ss.station_id = p_station_id AND ss.service_id = p_service_id
    AND ss.is_active = true AND sv.is_active = true AND sv.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_duration := make_interval(mins => v_duration_minutes);
  v_dow := EXTRACT(DOW FROM p_date);

  SELECT public.day_window_range(p_date, is_closed, is_24_hours, opens_at, closes_at)
  INTO v_station_window
  FROM public.station_operating_hours
  WHERE station_id = p_station_id AND day_of_week = v_dow;

  SELECT public.day_window_range(p_date, is_closed, is_24_hours, opens_at, closes_at)
  INTO v_service_window
  FROM public.service_operating_hours
  WHERE station_service_id = v_station_service_id AND day_of_week = v_dow;

  IF v_station_window IS NULL OR v_service_window IS NULL THEN
    RETURN; -- station closed, service closed, or no hours configured that day
  END IF;

  v_window := v_station_window * v_service_window; -- intersection

  IF v_window IS NULL OR isempty(v_window) THEN
    RETURN;
  END IF;

  v_slot_start := lower(v_window);
  WHILE v_slot_start + v_duration <= upper(v_window) LOOP
    v_slot := tstzrange(v_slot_start, v_slot_start + v_duration, '[)');
    v_resource_ids := NULL;
    v_employee_ids := NULL;

    IF v_requires_resource THEN
      SELECT array_agg(r) INTO v_resource_ids FROM public.available_resources_for_slot(v_station_service_id, v_slot) AS r;
      IF v_resource_ids IS NULL THEN
        v_slot_start := v_slot_start + v_granularity;
        CONTINUE;
      END IF;
    END IF;

    IF v_requires_employee OR p_employee_id IS NOT NULL THEN
      SELECT array_agg(e) INTO v_employee_ids
      FROM public.available_employees_for_slot(p_station_id, p_service_id, p_date, v_slot, p_employee_id) AS e;
      IF v_employee_ids IS NULL THEN
        v_slot_start := v_slot_start + v_granularity;
        CONTINUE;
      END IF;
    END IF;

    slot_start := lower(v_slot);
    slot_end := upper(v_slot);
    candidate_employee_ids := v_employee_ids;
    candidate_resource_ids := v_resource_ids;
    RETURN NEXT;

    v_slot_start := v_slot_start + v_granularity;
  END LOOP;

  RETURN;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7b. create_booking(): the only way a booking is ever inserted through the
-- API. SECURITY DEFINER bypasses RLS entirely, so this reimplements
-- bookings_insert's authorization check itself (owns_customer_row OR
-- is_station_staff) — the one place a real privilege-escalation bug could
-- hide if skipped. Re-validates availability at booking time (never trusts
-- a prior get_available_slots() call) and lets the existing EXCLUDE
-- constraints be the final race-condition authority: on a concurrent
-- conflict, the INSERT itself raises exclusion_violation (23P01), caught
-- below and re-raised as a friendlier message.
-- ----------------------------------------------------------------------------
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
  IF NOT (public.owns_customer_row(p_customer_id) OR public.is_station_staff(p_station_id)) THEN
    RAISE EXCEPTION 'not authorized to create this booking' USING ERRCODE = '42501';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, uuid, uuid, timestamptz, uuid, uuid, text) TO authenticated;
-- day_window_range/available_resources_for_slot/available_employees_for_slot
-- are deliberately NOT granted to anon/authenticated — internal building
-- blocks only, reached exclusively from inside the two SECURITY DEFINER
-- functions above (which run with the function owner's privileges, so they
-- don't need their own grant to call sibling functions they own). Default
-- privileges already revoke EXECUTE from PUBLIC on new functions (see
-- 20240101000005_default_privileges.sql), so no explicit REVOKE is needed
-- either — this keeps them unreachable as direct RPC endpoints.
