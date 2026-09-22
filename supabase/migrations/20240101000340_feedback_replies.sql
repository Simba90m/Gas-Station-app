-- ============================================================================
-- feedback_replies: a lightweight, append-only reply thread on a feedback
-- row — "Station Management" responding to a customer's rating/comment.
-- Not a general chat system: no read receipts, no attachments, no editing
-- (immutable once posted, same as booking_status_history/
-- complaint_status_history), and no realtime/notification wiring. Multiple
-- replies per feedback row are supported naturally (one row per reply,
-- ordered by created_at) since the brief allows a back-and-forth of a few
-- messages, not just a single response.
-- ============================================================================
CREATE TABLE public.feedback_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback (id) ON DELETE CASCADE,
  -- Nullable + ON DELETE SET NULL, same convention as
  -- complaint_status_history.changed_by: preserves the reply text even if
  -- the staff profile is later deleted. Always populated by the trigger
  -- below at insert time though — see set_feedback_reply_responder().
  responded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_replies_feedback_id_idx ON public.feedback_replies (feedback_id, created_at);

-- responded_by is always the actual caller, never a client-supplied value —
-- same reasoning as populate_feedback_from_booking overwriting NEW.* from
-- the booking rather than trusting the request body.
CREATE OR REPLACE FUNCTION public.set_feedback_reply_responder()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.responded_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_feedback_reply_responder
  BEFORE INSERT ON public.feedback_replies
  FOR EACH ROW EXECUTE FUNCTION public.set_feedback_reply_responder();

ALTER TABLE public.feedback_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_replies FORCE ROW LEVEL SECURITY;

-- Same visibility as the parent feedback row itself (feedback_select in
-- 20240101000140_rls_feedback_complaints.sql): the customer who left the
-- feedback, or any staff member of the station it was left at (which
-- already includes OWNER/MANAGER via is_station_staff()). An unrelated
-- customer or an employee at a different station gets no rows.
CREATE POLICY feedback_replies_select ON public.feedback_replies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_replies.feedback_id
        AND (public.owns_customer_row(f.customer_id) OR public.is_station_staff(f.station_id))
    )
  );

-- Reply authorization is "manager-tier", not "any station staff": OWNER/
-- MANAGER (all stations, via is_owner_or_manager() — reused, not
-- reimplemented) or a STATION_MANAGER for a station they're actually
-- assigned to. A plain EMPLOYEE never gets reply rights even if assigned to
-- the same station — is_station_staff() (used by feedback_replies_select
-- above) intentionally isn't reused here because it folds EMPLOYEE in too.
-- Same employee_station_assignments existence check is_station_staff()
-- itself uses, just narrowed to the STATION_MANAGER role. Lives here
-- rather than alongside is_owner_or_manager()/is_station_staff() in
-- 20240101000070_auth_handlers.sql because feedback replies are its first
-- consumer; a second consumer would be reason to move it there.
CREATE OR REPLACE FUNCTION public.is_station_manager_of(p_station_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_owner_or_manager()
    OR (
      public.current_user_role() = 'STATION_MANAGER'
      AND EXISTS (
        SELECT 1 FROM public.employee_station_assignments
        WHERE profile_id = auth.uid() AND station_id = p_station_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_station_manager_of(uuid) TO authenticated;

CREATE POLICY feedback_replies_insert ON public.feedback_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_replies.feedback_id
        AND public.is_station_manager_of(f.station_id)
    )
  );

-- No UPDATE/DELETE policy for `authenticated` — replies are immutable
-- history, same as booking_status_history/complaint_status_history.
