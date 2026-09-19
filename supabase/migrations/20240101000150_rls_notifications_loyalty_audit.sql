-- ============================================================================
-- RLS: notifications, notification_recipients, loyalty_accounts,
-- loyalty_transactions, audit_logs, device_tokens.
-- ============================================================================

-- ----------------------------------------------------------- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

-- Visible only through being a recipient — the event content itself carries
-- no owner column, so visibility is derived via notification_recipients.
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_recipients nr
      WHERE nr.notification_id = notifications.id AND nr.profile_id = auth.uid()
    )
    OR public.is_owner_or_manager()
  );

-- Automated notification sending (booking confirmations, reminders, ...) is
-- Phase 9 work. For now, OWNER/MANAGER can send manually (e.g. a broadcast).
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_or_manager());

-- --------------------------------------------------- notification_recipients
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_recipients FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_recipients_select ON public.notification_recipients
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_owner_or_manager());

CREATE POLICY notification_recipients_insert ON public.notification_recipients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_or_manager());

-- A recipient can only mark their own notification read/unread.
CREATE POLICY notification_recipients_update ON public.notification_recipients
  FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

REVOKE UPDATE ON public.notification_recipients FROM PUBLIC, anon, authenticated;
GRANT UPDATE (is_read, read_at) ON public.notification_recipients TO authenticated;
GRANT ALL ON public.notification_recipients TO service_role;

-- ------------------------------------------------------------- loyalty_accounts
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY loyalty_accounts_select ON public.loyalty_accounts
  FOR SELECT TO authenticated
  USING (public.owns_customer_row(customer_id) OR public.is_owner_or_manager());

-- No INSERT/UPDATE/DELETE policy for authenticated: accounts are
-- provisioned automatically at signup (handle_new_user) and the balance
-- only ever changes through loyalty_transactions.

-- ---------------------------------------------------------- loyalty_transactions
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY loyalty_transactions_select ON public.loyalty_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loyalty_accounts la
      WHERE la.id = loyalty_transactions.loyalty_account_id
        AND (public.owns_customer_row(la.customer_id) OR public.is_owner_or_manager())
    )
  );

-- Points are granted by the business (owner/manager), not self-service —
-- otherwise a customer could just award themselves points. Automated
-- earning (e.g. points per completed booking) is a later-phase concern that
-- will insert via a trusted trigger/function, same as booking_status_history.
CREATE POLICY loyalty_transactions_insert ON public.loyalty_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_owner_or_manager());

REVOKE UPDATE, DELETE ON public.loyalty_transactions FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_owner_or_manager());

-- Staff can log their own administrative actions; actor_id must be their
-- own id (can't attribute an action to someone else).
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'STATION_MANAGER')
  );

-- ------------------------------------------------------------- device_tokens
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY device_tokens_all ON public.device_tokens
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
