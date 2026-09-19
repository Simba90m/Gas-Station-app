-- ============================================================================
-- DEMO / SEED DATA — services, per-station offerings, operating hours, and
-- car wash bays. Hours below are taken directly from the project brief's
-- own late-night example, including the midnight-crossing ones.
--
-- Every INSERT below is guarded (ON CONFLICT ... DO NOTHING, on each table's
-- real primary key or unique constraint) so this file is safe to run more
-- than once — see the note at the top of 01_stations.sql.
-- ============================================================================

INSERT INTO public.services (id, name_en, name_ar, description_en, description_ar, base_price, duration_minutes, requires_employee_selection, requires_resource)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'Fuel', 'وقود', 'Petrol and diesel fuel.', 'بنزين وديزل.', 0, 5, false, false),
  ('40000000-0000-0000-0000-000000000002', 'Car Wash Standard', 'غسيل سيارات عادي', 'Exterior wash.', 'غسيل خارجي.', 80, 30, true, true),
  ('40000000-0000-0000-0000-000000000003', 'Car Wash Premium', 'غسيل سيارات فاخر', 'Interior + exterior wash and polish.', 'غسيل داخلي وخارجي وتلميع.', 180, 45, true, true),
  ('40000000-0000-0000-0000-000000000004', 'Oil Change', 'تغيير زيت', 'Engine oil and filter change.', 'تغيير زيت المحرك والفلتر.', 250, 30, false, false),
  ('40000000-0000-0000-0000-000000000005', 'Café', 'كافيه', 'Coffee, drinks, and light snacks.', 'قهوة ومشروبات ووجبات خفيفة.', 0, 10, false, false)
ON CONFLICT (id) DO NOTHING;

-- Fuel is offered at all 3 stations. Car wash / oil change / café vary by
-- station (see docs/DATABASE_DESIGN.md — "a service should only be
-- bookable when the station AND the service are open").
INSERT INTO public.station_services (id, station_id, service_id, price_override)
VALUES
  -- Station 1 (Stanley): full lineup
  ('50000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', NULL),
  ('50000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', NULL),
  ('50000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', NULL),
  ('50000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', NULL),
  ('50000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', NULL),
  -- Station 2 (Smouha): fuel, standard wash, oil change — no premium wash or café
  ('50000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', NULL),
  ('50000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 70), -- cheaper here
  ('50000000-0000-0000-0000-000000000024', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', NULL),
  -- Station 3 (Miami): fuel, both washes, café — no oil change
  ('50000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', NULL),
  ('50000000-0000-0000-0000-000000000032', '10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', NULL),
  ('50000000-0000-0000-0000-000000000033', '10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 200), -- pricier, seaside location
  ('50000000-0000-0000-0000-000000000035', '10000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000005', NULL)
ON CONFLICT (id) DO NOTHING;

-- Fuel: 24 hours, every station that offers it.
INSERT INTO public.service_operating_hours (service_id, day_of_week, is_24_hours)
SELECT '40000000-0000-0000-0000-000000000001', d, true FROM generate_series(0, 6) AS d
ON CONFLICT (service_id, day_of_week) DO NOTHING;

-- Car Wash (both tiers): 12:00 PM - 4:00 AM — crosses midnight.
INSERT INTO public.service_operating_hours (service_id, day_of_week, opens_at, closes_at)
SELECT id, d, '12:00'::time, '04:00'::time
FROM public.services, generate_series(0, 6) AS d
WHERE id IN ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003')
ON CONFLICT (service_id, day_of_week) DO NOTHING;

-- Oil Change: 10:00 AM - 2:00 AM — also crosses midnight.
INSERT INTO public.service_operating_hours (service_id, day_of_week, opens_at, closes_at)
SELECT '40000000-0000-0000-0000-000000000004', d, '10:00'::time, '02:00'::time FROM generate_series(0, 6) AS d
ON CONFLICT (service_id, day_of_week) DO NOTHING;

-- Café: 5:00 PM - 4:00 AM — also crosses midnight, matches the brief's
-- late-night example exactly.
INSERT INTO public.service_operating_hours (service_id, day_of_week, opens_at, closes_at)
SELECT '40000000-0000-0000-0000-000000000005', d, '17:00'::time, '04:00'::time FROM generate_series(0, 6) AS d
ON CONFLICT (service_id, day_of_week) DO NOTHING;

-- Car wash bays — configurable per station, per the brief ("Station 1: Bay
-- 1, Bay 2, Bay 3 ... configurable per station").
INSERT INTO public.service_resources (station_service_id, name_en, name_ar)
VALUES
  -- Station 1 standard wash: 2 bays
  ('50000000-0000-0000-0000-000000000012', 'Bay 1', 'مسار 1'),
  ('50000000-0000-0000-0000-000000000012', 'Bay 2', 'مسار 2'),
  -- Station 1 premium wash: 1 dedicated bay
  ('50000000-0000-0000-0000-000000000013', 'Premium Bay', 'مسار فاخر'),
  -- Station 2 standard wash: 2 bays
  ('50000000-0000-0000-0000-000000000022', 'Bay 1', 'مسار 1'),
  ('50000000-0000-0000-0000-000000000022', 'Bay 2', 'مسار 2'),
  -- Station 3: 1 shared bay for standard, 1 for premium
  ('50000000-0000-0000-0000-000000000032', 'Bay 1', 'مسار 1'),
  ('50000000-0000-0000-0000-000000000033', 'Premium Bay', 'مسار فاخر')
ON CONFLICT (station_service_id, name_en) DO NOTHING;

-- One bay under maintenance, to demonstrate the maintenance-status feature.
UPDATE public.service_resources SET status = 'MAINTENANCE'
WHERE station_service_id = '50000000-0000-0000-0000-000000000022' AND name_en = 'Bay 2';
