-- Append-only log of administrative actions (employee created/disabled,
-- station changed, offer changed, booking manually changed, complaint
-- status changed, ...). Deliberately minimal per the brief ("do not
-- over-engineer it yet") — actor, what happened, to what, and when.
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs (actor_id);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at);

-- Immutable: nobody, not even an OWNER through the normal app role, can
-- edit or delete an audit entry after the fact. Only service_role (used for
-- trusted server-side/administrative scripts, never shipped in an app) can.
REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- device_tokens: push notification tokens, one row per device per user.
-- ============================================================================
CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, token)
);

CREATE INDEX device_tokens_profile_id_idx ON public.device_tokens (profile_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
