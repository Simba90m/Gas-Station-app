-- Configurable services (fuel, car wash tiers, oil change, café, ...) — never
-- hard-coded in application code. Prices are always EGP (see
-- packages/utils CURRENCY constant); no currency column since this platform
-- doesn't support multiple currencies.
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text NOT NULL,
  description_en text,
  description_ar text,
  image_url text,
  base_price numeric(10, 2) NOT NULL CHECK (base_price >= 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  requires_employee_selection boolean NOT NULL DEFAULT false,
  requires_resource boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX services_is_active_idx ON public.services (is_active);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- station_services: which services a given station actually offers, with an
-- optional per-station price override.
-- ============================================================================
CREATE TABLE public.station_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  price_override numeric(10, 2) CHECK (price_override IS NULL OR price_override >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, service_id)
);

CREATE INDEX station_services_station_id_idx ON public.station_services (station_id);
CREATE INDEX station_services_service_id_idx ON public.station_services (service_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.station_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- service_operating_hours: per-service, per-day-of-week schedule — separate
-- from station_operating_hours. Example: the station is open 24h, but its
-- car wash only runs 12:00-04:00 and its café 17:00-04:00.
-- ============================================================================
CREATE TABLE public.service_operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  is_24_hours boolean NOT NULL DEFAULT false,
  opens_at time,
  closes_at time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, day_of_week),
  CHECK (public.is_valid_hours_row(is_closed, is_24_hours, opens_at, closes_at))
);

CREATE INDEX service_operating_hours_service_id_idx ON public.service_operating_hours (service_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.service_operating_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- service_resources: bookable resources a station's service needs, e.g. car
-- wash bays. Configured per station (Station 1 might have 3 bays, Station 2
-- only 2) via station_services, not globally per service.
-- ============================================================================
CREATE TABLE public.service_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_service_id uuid NOT NULL REFERENCES public.station_services (id) ON DELETE CASCADE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  status public.resource_status NOT NULL DEFAULT 'AVAILABLE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_service_id, name_en)
);

CREATE INDEX service_resources_station_service_id_idx ON public.service_resources (station_service_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.service_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- offers: promotions. "Applicable services" is a single nullable column
-- (NULL = applies to every service at the applicable stations) rather than
-- an offer_services join table, since the project's table list only calls
-- for offer_stations.
-- ============================================================================
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_ar text NOT NULL,
  description_en text,
  description_ar text,
  image_url text,
  service_id uuid REFERENCES public.services (id) ON DELETE SET NULL,
  discount_type public.discount_type NOT NULL,
  discount_value numeric(10, 2) NOT NULL CHECK (discount_value > 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  terms_en text,
  terms_ar text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'PERCENTAGE' OR discount_value <= 100)
);

CREATE INDEX offers_is_active_idx ON public.offers (is_active);
CREATE INDEX offers_starts_ends_idx ON public.offers (starts_at, ends_at);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.offer_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers (id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, station_id)
);

CREATE INDEX offer_stations_station_id_idx ON public.offer_stations (station_id);
