-- A walk-up queue for one station+service combination.
CREATE TABLE public.queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  station_service_id uuid NOT NULL REFERENCES public.station_services (id) ON DELETE CASCADE,
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, station_service_id)
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.queues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.queues (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  estimated_wait_minutes integer CHECK (estimated_wait_minutes IS NULL OR estimated_wait_minutes >= 0),
  status public.queue_status NOT NULL DEFAULT 'WAITING',
  joined_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX queue_entries_queue_id_idx ON public.queue_entries (queue_id);
CREATE INDEX queue_entries_customer_id_idx ON public.queue_entries (customer_id);
CREATE INDEX queue_entries_status_idx ON public.queue_entries (status);

-- A queue position is only unique among entries that are still active —
-- once an entry completes/cancels its position number can be reused.
CREATE UNIQUE INDEX queue_entries_position_active_idx
  ON public.queue_entries (queue_id, position) WHERE status IN ('WAITING', 'CALLED');

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
