-- One notification event, e.g. "booking confirmed". Fan-out to recipients
-- is a separate table so one event can reach multiple people (e.g. a
-- station-wide "queue update" notification).
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.notification_type NOT NULL,
  title_en text NOT NULL,
  title_ar text NOT NULL,
  body_en text NOT NULL,
  body_ar text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_created_at_idx ON public.notifications (created_at);

CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, profile_id),
  CHECK (is_read = (read_at IS NOT NULL))
);

CREATE INDEX notification_recipients_profile_id_idx ON public.notification_recipients (profile_id);
CREATE INDEX notification_recipients_unread_idx ON public.notification_recipients (profile_id) WHERE is_read = false;

-- ============================================================================
-- loyalty_accounts / loyalty_transactions: minimal foundation per the brief
-- ("do not over-engineer this initially"). points_balance is kept in sync
-- with the sum of transactions by a trigger, so it's always derivable and
-- never drifts from its own audit trail.
-- ============================================================================
CREATE TABLE public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers (id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loyalty_account_id uuid NOT NULL REFERENCES public.loyalty_accounts (id) ON DELETE CASCADE,
  points integer NOT NULL CHECK (points <> 0),
  reason text NOT NULL,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX loyalty_transactions_account_id_idx ON public.loyalty_transactions (loyalty_account_id);

CREATE OR REPLACE FUNCTION public.apply_loyalty_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.loyalty_accounts
  SET points_balance = points_balance + NEW.points
  WHERE id = NEW.loyalty_account_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER apply_loyalty_transaction
  AFTER INSERT ON public.loyalty_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_loyalty_transaction();

-- Extend handle_new_user (defined in 20240101000070_auth_handlers.sql) now
-- that loyalty_accounts exists, so every new customer already has a
-- zero-balance loyalty account ready to receive transactions later.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    NEW.id,
    'CUSTOMER',
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'phone'
  );

  INSERT INTO public.customers (id) VALUES (NEW.id);
  INSERT INTO public.loyalty_accounts (customer_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;
