CREATE TABLE public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text NOT NULL,
  description_en text,
  description_ar text,
  address_en text NOT NULL,
  address_ar text NOT NULL,
  latitude numeric(9, 6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9, 6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  phone text,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX stations_is_active_idx ON public.stations (is_active);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- station_operating_hours: per-station, per-day-of-week schedule.
-- Separate from service_operating_hours — a station can be open 24h while
-- an individual service (car wash, café, ...) keeps its own, different hours.
-- ============================================================================
CREATE TABLE public.station_operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  -- 0 = Sunday .. 6 = Saturday, matching Postgres EXTRACT(DOW FROM ...).
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  is_24_hours boolean NOT NULL DEFAULT false,
  opens_at time,
  closes_at time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, day_of_week),
  CHECK (public.is_valid_hours_row(is_closed, is_24_hours, opens_at, closes_at))
);

COMMENT ON COLUMN public.station_operating_hours.opens_at IS
  'May be later than closes_at, meaning the window crosses midnight (e.g. 22:00-04:00). Interpreted by application logic, not enforced by the schema.';

CREATE INDEX station_operating_hours_station_id_idx ON public.station_operating_hours (station_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.station_operating_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
