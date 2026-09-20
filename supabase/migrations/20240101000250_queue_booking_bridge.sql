-- ============================================================================
-- Phase 7.3: queue <-> booking bridge.
--
-- Adds the three operations the walk-in queue needs on top of the existing
-- booking engine (nothing below reimplements availability/conflict logic —
-- start_queue_service() calls the existing create_booking() RPC for that):
--   1. A status-transition guard trigger on queue_entries, mirroring
--      validate_booking_status_transition() from 20240101000230.
--   2. join_queue() — assigns the next queue position atomically (an
--      advisory lock, not a row lock, since the queue can legitimately be
--      empty when two customers join at the same instant) and inserts the
--      entry. Same owns_customer_row()/is_station_staff() authorization
--      shape as create_booking() — a customer joins themselves, staff can
--      add a walk-in.
--   3. start_queue_service() — the "start service creates booking" product
--      decision: turns a WAITING/CALLED entry into an IN_SERVICE one by
--      calling create_booking() with start_at = now() and linking the
--      resulting booking via converted_booking_id. Staff-only.
--   4. complete_queue_service() — marks an IN_SERVICE entry COMPLETED and
--      syncs its linked booking to COMPLETED too. Staff-only.
--
-- All three are SECURITY DEFINER (bypass RLS) and reimplement their own
-- authorization exactly like create_booking() already does, for the same
-- reason: the privileged mechanism bypasses the normal RLS boundary, so the
-- check has to happen explicitly inside the function.
--
-- These are reached from two places: the admin "Today's Operations" screen
-- (an authenticated staff session) and the public /join/[token] self-service
-- flow — but the public flow signs the new customer into a REAL Supabase
-- Auth session first (see apps/admin/src/app/join/[token]/actions.ts), so by
-- the time it calls these RPCs it's an ordinary authenticated customer call.
-- No separate "public" variant of these functions exists, and none is
-- granted to anon — that would require duplicating the authorization logic
-- a second time for no reason.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Status-transition guard: WAITING -> CALLED -> IN_SERVICE -> COMPLETED,
-- forward-only (skips allowed); CANCELLED reachable from WAITING/CALLED/
-- IN_SERVICE; NO_SHOW only from WAITING/CALLED (once IN_SERVICE, the
-- customer clearly showed up). Terminal: COMPLETED/CANCELLED/NO_SHOW.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_queue_entry_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_order text[] := ARRAY['WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED'];
  v_old_rank int;
  v_new_rank int;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW') THEN
    RAISE EXCEPTION 'queue entry % is in a terminal state (%) and cannot transition to %', OLD.id, OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'NO_SHOW' THEN
    IF OLD.status NOT IN ('WAITING', 'CALLED') THEN
      RAISE EXCEPTION 'invalid queue entry transition: % -> NO_SHOW (only WAITING/CALLED can become NO_SHOW)', OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  v_old_rank := array_position(v_order, OLD.status::text);
  v_new_rank := array_position(v_order, NEW.status::text);

  IF v_old_rank IS NULL OR v_new_rank IS NULL OR v_new_rank <= v_old_rank THEN
    RAISE EXCEPTION 'invalid queue entry status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_queue_entry_status_transition
  BEFORE UPDATE OF status ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_queue_entry_status_transition();

-- ----------------------------------------------------------------------------
-- 2. join_queue()
-- ----------------------------------------------------------------------------
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
  v_queue_id uuid;
  v_station_id uuid;
  v_is_open boolean;
  v_next_position integer;
  v_entry public.queue_entries;
BEGIN
  SELECT q.id, q.station_id, q.is_open
  INTO v_queue_id, v_station_id, v_is_open
  FROM public.queues q
  WHERE q.station_service_id = p_station_service_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no walk-in queue exists for this station service';
  END IF;

  IF NOT (public.owns_customer_row(p_customer_id) OR public.is_station_staff(v_station_id)) THEN
    RAISE EXCEPTION 'not authorized to join this queue' USING ERRCODE = '42501';
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

  -- Serialize position assignment per queue. An advisory lock (not
  -- SELECT ... FOR UPDATE on existing rows) because the queue can
  -- legitimately have zero active rows to lock when two customers join at
  -- the same instant — the real race-condition authority is still the
  -- partial unique index on (queue_id, position), this lock just avoids
  -- making a genuinely concurrent joiner retry on a unique-violation.
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

-- ----------------------------------------------------------------------------
-- 3. start_queue_service() — "start service creates booking". Delegates all
-- availability/conflict logic to create_booking(); this function only owns
-- the queue-entry <-> booking linking.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_queue_service(
  p_queue_entry_id uuid,
  p_employee_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries;
  v_queue public.queues;
  v_service_id uuid;
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id = p_queue_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue entry not found';
  END IF;

  SELECT * INTO v_queue FROM public.queues WHERE id = v_entry.queue_id;

  IF NOT public.is_station_staff(v_queue.station_id) THEN
    RAISE EXCEPTION 'not authorized to start service for this queue entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status NOT IN ('WAITING', 'CALLED') THEN
    RAISE EXCEPTION 'this queue entry is not waiting to be served (status: %)', v_entry.status;
  END IF;

  SELECT ss.service_id INTO v_service_id
  FROM public.station_services ss WHERE ss.id = v_queue.station_service_id;

  v_booking := public.create_booking(
    p_customer_id => v_entry.customer_id,
    p_station_id => v_queue.station_id,
    p_service_id => v_service_id,
    p_start_at => now(),
    p_employee_id => p_employee_id,
    p_resource_id => p_resource_id,
    p_notes => NULL
  );

  UPDATE public.queue_entries
  SET status = 'IN_SERVICE',
      called_at = COALESCE(called_at, now()),
      converted_booking_id = v_booking.id
  WHERE id = p_queue_entry_id;

  RETURN v_booking;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. complete_queue_service()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_queue_service(p_queue_entry_id uuid)
RETURNS public.queue_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries;
  v_queue public.queues;
BEGIN
  SELECT * INTO v_entry FROM public.queue_entries WHERE id = p_queue_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue entry not found';
  END IF;

  SELECT * INTO v_queue FROM public.queues WHERE id = v_entry.queue_id;

  IF NOT public.is_station_staff(v_queue.station_id) THEN
    RAISE EXCEPTION 'not authorized to complete this queue entry' USING ERRCODE = '42501';
  END IF;

  IF v_entry.status <> 'IN_SERVICE' THEN
    RAISE EXCEPTION 'this queue entry is not in service (status: %)', v_entry.status;
  END IF;

  UPDATE public.queue_entries
  SET status = 'COMPLETED', completed_at = now()
  WHERE id = p_queue_entry_id
  RETURNING * INTO v_entry;

  IF v_entry.converted_booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET status = 'COMPLETED'
    WHERE id = v_entry.converted_booking_id
      AND status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW');
  END IF;

  RETURN v_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_queue(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_queue_service(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_queue_service(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Realtime — Today's Operations watches these tables live. RLS still
-- applies per-subscriber automatically; this only adds them to the
-- publication Supabase's Realtime server reads from.
-- ----------------------------------------------------------------------------
-- Idempotent (not a bare ALTER PUBLICATION ... ADD TABLE): either table may
-- already have been added by hand via the dashboard's Database > Replication
-- page before this migration existed, and re-adding an existing member
-- fails outright rather than no-op'ing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'queue_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_entries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END;
$$;
