-- ============================================================================
-- RLS: feedback, complaints, complaint_status_history.
--
-- Column-level privilege protection for complaints.internal_notes was
-- already set up in 20240101000080_feedback_and_complaints.sql (REVOKE/GRANT
-- + SECURITY DEFINER accessor functions) — the policies below add row-level
-- restrictions on top of that.
-- ============================================================================

-- --------------------------------------------------------------- feedback
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback FORCE ROW LEVEL SECURITY;

CREATE POLICY feedback_select ON public.feedback
  FOR SELECT TO authenticated
  USING (
    public.owns_customer_row(customer_id)
    OR public.is_assigned_employee(employee_id)
    OR public.is_station_staff(station_id)
  );

-- customer_id/station_id/station_service_id/employee_id are overwritten by
-- populate_feedback_from_booking (BEFORE INSERT) from the referenced
-- booking before this WITH CHECK evaluates, so a customer can't claim
-- feedback for someone else's booking even by supplying a different
-- customer_id in the request payload.
CREATE POLICY feedback_insert ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_customer_row(customer_id));

CREATE POLICY feedback_update ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.owns_customer_row(customer_id))
  WITH CHECK (public.owns_customer_row(customer_id));

REVOKE UPDATE ON public.feedback FROM PUBLIC, anon, authenticated;
GRANT UPDATE (rating, category, comment, photo_url) ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

-- ------------------------------------------------------------- complaints
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints FORCE ROW LEVEL SECURITY;

CREATE POLICY complaints_select ON public.complaints
  FOR SELECT TO authenticated
  USING (
    public.owns_customer_row(customer_id)
    OR (station_id IS NOT NULL AND public.is_station_staff(station_id))
    OR (station_id IS NULL AND public.is_owner_or_manager())
  );

CREATE POLICY complaints_insert ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_customer_row(customer_id));

-- Staff can change status (the only column granted for UPDATE — see the
-- GRANT in 20240101000080); internal_notes goes through
-- get/set_complaint_internal_notes() instead, which apply this same check.
CREATE POLICY complaints_update ON public.complaints
  FOR UPDATE TO authenticated
  USING (station_id IS NOT NULL AND public.is_station_staff(station_id))
  WITH CHECK (station_id IS NOT NULL AND public.is_station_staff(station_id));

-- --------------------------------------------------------- complaint_status_history
ALTER TABLE public.complaint_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_status_history FORCE ROW LEVEL SECURITY;

-- Written only by the record_complaint_status_change trigger — no
-- INSERT/UPDATE/DELETE policy for authenticated.
CREATE POLICY complaint_status_history_select ON public.complaint_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_status_history.complaint_id
        AND (
          public.owns_customer_row(c.customer_id)
          OR (c.station_id IS NOT NULL AND public.is_station_staff(c.station_id))
          OR (c.station_id IS NULL AND public.is_owner_or_manager())
        )
    )
  );
