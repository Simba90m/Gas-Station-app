-- ============================================================================
-- RLS: bookings, booking_status_history, queues, queue_entries.
-- ============================================================================

-- --------------------------------------------------------------- bookings
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings FORCE ROW LEVEL SECURITY;

CREATE POLICY bookings_select ON public.bookings
  FOR SELECT TO authenticated
  USING (
    public.owns_customer_row(customer_id)
    OR public.is_assigned_employee(employee_id)
    OR public.is_station_staff(station_id)
  );

-- A customer books for themselves; station staff can also create a booking
-- on behalf of a walk-in customer.
CREATE POLICY bookings_insert ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_customer_row(customer_id) OR public.is_station_staff(station_id));

-- A customer may only cancel their own booking (status -> CANCELLED), never
-- set any other status or change any other booking — that's the "where
-- appropriate" in "customers can read/update their own bookings where
-- appropriate" from the brief. Station staff / the assigned employee can
-- update any field (check-in, start/complete service, mark no-show, ...).
-- Permissive policies combine with OR, so a customer's update is allowed if
-- it satisfies EITHER this policy's WITH CHECK OR the staff policy's.
CREATE POLICY bookings_update_customer_cancel ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.owns_customer_row(customer_id))
  WITH CHECK (public.owns_customer_row(customer_id) AND status = 'CANCELLED');

CREATE POLICY bookings_update_staff ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_station_staff(station_id) OR public.is_assigned_employee(employee_id))
  WITH CHECK (public.is_station_staff(station_id) OR public.is_assigned_employee(employee_id));

-- No DELETE policy: bookings are cancelled (status change), never removed,
-- so booking_status_history and feedback/complaints always have something
-- to reference.

-- ------------------------------------------------------- booking_status_history
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history FORCE ROW LEVEL SECURITY;

-- Written only by the record_booking_status_change trigger (runs as the
-- table owner, which bypasses RLS) — no INSERT/UPDATE/DELETE policy for
-- authenticated, so the history can't be tampered with via the API.
CREATE POLICY booking_status_history_select ON public.booking_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_status_history.booking_id
        AND (
          public.owns_customer_row(b.customer_id)
          OR public.is_assigned_employee(b.employee_id)
          OR public.is_station_staff(b.station_id)
        )
    )
  );

-- ----------------------------------------------------------------- queues
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues FORCE ROW LEVEL SECURITY;

CREATE POLICY queues_select ON public.queues
  FOR SELECT TO anon, authenticated
  USING (is_open = true OR public.is_station_staff(station_id));

CREATE POLICY queues_write ON public.queues
  FOR ALL TO authenticated
  USING (public.is_station_staff(station_id))
  WITH CHECK (public.is_station_staff(station_id));

-- ----------------------------------------------------------- queue_entries
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY queue_entries_select ON public.queue_entries
  FOR SELECT TO authenticated
  USING (
    public.owns_customer_row(customer_id)
    OR EXISTS (
      SELECT 1 FROM public.queues q WHERE q.id = queue_entries.queue_id AND public.is_station_staff(q.station_id)
    )
  );

-- A customer joins a queue themselves; staff can add a walk-in.
CREATE POLICY queue_entries_insert ON public.queue_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.owns_customer_row(customer_id)
    OR EXISTS (
      SELECT 1 FROM public.queues q WHERE q.id = queue_entries.queue_id AND public.is_station_staff(q.station_id)
    )
  );

-- Same pattern as bookings: a customer may only cancel their own entry,
-- staff can update any field (call next, mark in-service/completed/no-show).
CREATE POLICY queue_entries_update_customer_cancel ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (public.owns_customer_row(customer_id))
  WITH CHECK (public.owns_customer_row(customer_id) AND status = 'CANCELLED');

CREATE POLICY queue_entries_update_staff ON public.queue_entries
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.queues q WHERE q.id = queue_entries.queue_id AND public.is_station_staff(q.station_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.queues q WHERE q.id = queue_entries.queue_id AND public.is_station_staff(q.station_id)));
