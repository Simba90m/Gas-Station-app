-- ============================================================================
-- feedback: one row per completed booking, max. station_id/station_service_id/
-- employee_id are copied from the booking automatically (see the trigger
-- below) rather than supplied by the client — a customer can't claim
-- feedback happened at a different station/employee than their actual
-- booking.
-- ============================================================================
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  station_service_id uuid NOT NULL REFERENCES public.station_services (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category public.issue_category NOT NULL,
  comment text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON CONSTRAINT feedback_booking_id_key ON public.feedback IS
  'UNIQUE booking_id is what actually prevents duplicate feedback for the same booking — enforced by Postgres, not just app logic.';

CREATE INDEX feedback_customer_id_idx ON public.feedback (customer_id);
CREATE INDEX feedback_station_id_idx ON public.feedback (station_id);
CREATE INDEX feedback_employee_id_idx ON public.feedback (employee_id);
CREATE INDEX feedback_rating_idx ON public.feedback (rating);
CREATE INDEX feedback_created_at_idx ON public.feedback (created_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.populate_feedback_from_booking()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  b public.bookings;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;

  IF b.id IS NULL THEN
    RAISE EXCEPTION 'booking % does not exist', NEW.booking_id;
  END IF;

  IF b.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'feedback can only be submitted for a COMPLETED booking (booking % is %)', b.id, b.status;
  END IF;

  NEW.customer_id := b.customer_id;
  NEW.station_id := b.station_id;
  NEW.station_service_id := b.station_service_id;
  NEW.employee_id := b.employee_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER populate_feedback_from_booking
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.populate_feedback_from_booking();

-- ============================================================================
-- complaints
--
-- internal_notes is where "managers can add internal notes; customers must
-- NOT see internal notes" (from the project brief) is enforced as a real
-- database-level guarantee, not just an app-level filter: RLS is row-level
-- and can't hide one column from one row while showing the rest, so instead
-- we REVOKE column-level SELECT/UPDATE on internal_notes from the shared
-- `authenticated` Postgres role (which customers AND staff both connect as)
-- and expose it only through the SECURITY DEFINER functions below, which
-- check the caller's app-level role themselves. Even a bug in a future RLS
-- policy on this table can't leak internal_notes through a plain SELECT *.
-- ============================================================================
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  station_id uuid REFERENCES public.stations (id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  category public.issue_category NOT NULL,
  description text NOT NULL,
  photo_url text,
  status public.complaint_status NOT NULL DEFAULT 'NEW',
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX complaints_customer_id_idx ON public.complaints (customer_id);
CREATE INDEX complaints_station_id_idx ON public.complaints (station_id);
CREATE INDEX complaints_status_idx ON public.complaints (status);
CREATE INDEX complaints_created_at_idx ON public.complaints (created_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deny-by-default on the whole table, then grant back everything except
-- internal_notes to `authenticated`. RLS (added in a later migration) still
-- decides which *rows* are visible; this decides which *columns* are.
REVOKE ALL ON public.complaints FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, customer_id, station_id, booking_id, employee_id,
  category, description, photo_url, status, created_at, updated_at
) ON public.complaints TO authenticated;
GRANT INSERT (customer_id, station_id, booking_id, employee_id, category, description, photo_url)
  ON public.complaints TO authenticated;
GRANT UPDATE (status) ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;

CREATE OR REPLACE FUNCTION public.get_complaint_internal_notes(p_complaint_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  complaint_station_id uuid;
  notes text;
BEGIN
  SELECT station_id, internal_notes INTO complaint_station_id, notes
  FROM public.complaints WHERE id = p_complaint_id;

  IF complaint_station_id IS NULL OR NOT public.is_station_staff(complaint_station_id) THEN
    RAISE EXCEPTION 'not authorized to read internal notes for complaint %', p_complaint_id;
  END IF;

  RETURN notes;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_complaint_internal_notes(p_complaint_id uuid, p_notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  complaint_station_id uuid;
BEGIN
  SELECT station_id INTO complaint_station_id FROM public.complaints WHERE id = p_complaint_id;

  IF complaint_station_id IS NULL OR NOT public.is_station_staff(complaint_station_id) THEN
    RAISE EXCEPTION 'not authorized to update internal notes for complaint %', p_complaint_id;
  END IF;

  UPDATE public.complaints SET internal_notes = p_notes, updated_at = now() WHERE id = p_complaint_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_complaint_internal_notes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_complaint_internal_notes(uuid, text) TO authenticated;

CREATE TABLE public.complaint_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints (id) ON DELETE CASCADE,
  status public.complaint_status NOT NULL,
  changed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX complaint_status_history_complaint_id_idx ON public.complaint_status_history (complaint_id);

CREATE OR REPLACE FUNCTION public.record_complaint_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.complaint_status_history (complaint_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_complaint_status_change
  AFTER INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.record_complaint_status_change();
