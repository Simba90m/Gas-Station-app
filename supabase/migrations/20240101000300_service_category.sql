-- ============================================================================
-- services.category — distinguishes what a catalog "service" row actually
-- IS, for the product-first direction: bookable appointment/queue services
-- (car wash, oil change, ...) vs. business/station information (fuel) vs.
-- customer-facing content (café menu items, promotions).
--
-- Why a column on the EXISTING services table, not a new parallel table
-- per concept: a café menu item and a bookable service share almost every
-- column already (name_en/ar, description_en/ar, image_url, base_price,
-- is_active, per-station availability via station_services with its own
-- price_override) — the only thing that differs is what the row MEANS and
-- whether it's reachable from the booking/queue journey. A discriminator
-- column reuses 100% of the existing catalog machinery (RLS, the admin
-- Services panel, station_services' per-station offering + price
-- override) instead of duplicating it three times. This directly follows
-- the brief's own instruction not to hardcode "Café can never be booked"
-- as a permanent rule — it's a per-row value the owner sets (and can
-- change) through the same admin UI already used to create/edit services,
-- not a code branch.
--
-- Existing rows: every current service (Fuel, Car Wash Standard/Premium,
-- Oil Change, Café) defaults to 'BOOKABLE' via the column default, so nothing
-- already offered through the booking/queue journey silently disappears
-- from it. Reclassifying Fuel -> 'INFO' and Café -> 'CONTENT' is a seed-data
-- change (supabase/seed/03_services.sql), not something this migration
-- does — this migration only adds the capability; which rows use which
-- value is an owner/content decision, consistent with "not a permanent
-- architectural rule."
-- ============================================================================
CREATE TYPE public.service_category AS ENUM ('BOOKABLE', 'INFO', 'CONTENT');

ALTER TABLE public.services ADD COLUMN category public.service_category NOT NULL DEFAULT 'BOOKABLE';

COMMENT ON COLUMN public.services.category IS
  'BOOKABLE: appears in the booking/queue journey (get_available_slots/create_booking/join_queue all require this). INFO: station/business information (e.g. Fuel) — never bookable, shown as informational content only. CONTENT: customer-facing content with a price (e.g. a café menu item) — has its own station availability/price via station_services like any other catalog row, and can carry an offers/promotion, but is never bookable. Owner-editable per row via the admin Services panel — not a hardcoded rule about any particular service.';

-- ----------------------------------------------------------------------------
-- duration_minutes only means something for a BOOKABLE row (how long the
-- appointment/queue turn takes) — a café menu item or a station's fuel
-- info has no "duration." Relaxed to nullable, with a CHECK that a
-- BOOKABLE row must still have one (preserving today's guarantee for
-- every row that's actually used by the booking engine) and, when
-- present, that it's still positive.
-- ----------------------------------------------------------------------------
ALTER TABLE public.services ALTER COLUMN duration_minutes DROP NOT NULL;

ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_duration_minutes_check;
ALTER TABLE public.services
  ADD CONSTRAINT services_duration_minutes_check CHECK (duration_minutes IS NULL OR duration_minutes > 0);
ALTER TABLE public.services
  ADD CONSTRAINT services_bookable_requires_duration_check
  CHECK (category <> 'BOOKABLE' OR duration_minutes IS NOT NULL);

-- ----------------------------------------------------------------------------
-- Server-side enforcement: only a BOOKABLE service can ever produce a slot,
-- a booking, or a queue join — the same guarantee the client-side
-- filtering (apps/admin's booking wizard, apps/mobile's service picker)
-- already applies, but here it can't be bypassed by calling the RPC
-- directly. Fuel/café rows existing in the catalog and being fully
-- manageable there never means they can enter the booking/queue flow.
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
    AND ss.is_active = true AND sv.is_active = true AND sv.deleted_at IS NULL
    AND sv.category = 'BOOKABLE';

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

-- _create_booking_core(): identical to
-- supabase/migrations/20240101000260_global_phone_and_kiosk.sql's version,
-- with one added condition (sv.category = 'BOOKABLE') on the
-- station_services/services lookup — the same guard get_available_slots()
-- above just got, so a booking can never be created for Fuel/café content
-- even by calling this directly, bypassing the picker UI entirely.
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
    AND ss.is_active = true AND sv.is_active = true AND sv.deleted_at IS NULL
    AND sv.category = 'BOOKABLE';

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

-- _join_queue_core(): identical to
-- supabase/migrations/20240101000250_queue_booking_bridge.sql's version,
-- with the same added category guard — a queue can technically exist for
-- any station_service today (the `queues` table doesn't itself encode
-- category), so this is where a non-bookable service actually gets
-- refused for the walk-in path.
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
  v_category public.service_category;
  v_next_position integer;
  v_entry public.queue_entries;
BEGIN
  SELECT q.id, q.is_open, sv.category
  INTO v_queue_id, v_is_open, v_category
  FROM public.queues q
  JOIN public.station_services ss ON ss.id = q.station_service_id
  JOIN public.services sv ON sv.id = ss.service_id
  WHERE q.station_service_id = p_station_service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no walk-in queue exists for this station service';
  END IF;

  IF v_category <> 'BOOKABLE' THEN
    RAISE EXCEPTION 'this service cannot be joined as a walk-in queue';
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
