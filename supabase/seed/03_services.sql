-- ============================================================================
-- DEMO / SEED DATA — services, per-station offerings, operating hours, and
-- car wash bays. Hours below are taken directly from the project brief's
-- own late-night example, including the midnight-crossing ones.
--
-- Every INSERT below is guarded (ON CONFLICT ... DO NOTHING, on each table's
-- real primary key or unique constraint) so this file is safe to run more
-- than once — see the note at the top of 01_stations.sql.
-- ============================================================================

-- category (supabase/migrations/20240101000300_service_category.sql): Fuel
-- is station/business information, never bookable — 'INFO'. Café is
-- customer-facing content (a menu item), also never bookable, but still a
-- real priced, per-station catalog row like any other — 'CONTENT'. Car
-- Wash/Oil Change are the actual appointment/queue services — 'BOOKABLE',
-- the column default, set explicitly below anyway for clarity. This is
-- seed data's own choice, not a hardcoded rule: an owner can change any
-- row's category from the admin Services panel.
INSERT INTO public.services (id, name_en, name_ar, description_en, description_ar, base_price, duration_minutes, requires_employee_selection, requires_resource, category)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'Fuel', 'وقود', 'Petrol and diesel fuel.', 'بنزين وديزل.', 0, 5, false, false, 'INFO'),
  ('40000000-0000-0000-0000-000000000002', 'Car Wash Standard', 'غسيل سيارات عادي', 'Exterior wash.', 'غسيل خارجي.', 80, 30, true, true, 'BOOKABLE'),
  ('40000000-0000-0000-0000-000000000003', 'Car Wash Premium', 'غسيل سيارات فاخر', 'Interior + exterior wash and polish.', 'غسيل داخلي وخارجي وتلميع.', 180, 45, true, true, 'BOOKABLE'),
  ('40000000-0000-0000-0000-000000000004', 'Oil Change', 'تغيير زيت', 'Engine oil and filter change.', 'تغيير زيت المحرك والفلتر.', 250, 30, false, false, 'BOOKABLE'),
  ('40000000-0000-0000-0000-000000000005', 'Café', 'كافيه', 'Coffee, drinks, and light snacks.', 'قهوة ومشروبات ووجبات خفيفة.', 0, 10, false, false, 'CONTENT')
ON CONFLICT (id) DO NOTHING;

-- Unconditional, not just ON CONFLICT DO NOTHING's job: if this seed ran
-- before supabase/migrations/20240101000300_service_category.sql existed,
-- these two rows already exist with category defaulted to 'BOOKABLE' — the
-- INSERT above would skip them entirely on a re-run, silently leaving
-- Fuel/Café bookable. This corrects that regardless of which order
-- migrations/seed were applied in.
UPDATE public.services SET category = 'INFO' WHERE id = '40000000-0000-0000-0000-000000000001';
UPDATE public.services SET category = 'CONTENT' WHERE id = '40000000-0000-0000-0000-000000000005';

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

-- Operating hours are per station_service (Phase 5 — see
-- docs/DATABASE_DESIGN.md "Changes from the original plan" #3), not per
-- global service, so every row below names the specific station_services
-- id(s) it applies to rather than the catalog service. Every station
-- currently offering a given service happens to share the same hours here
-- — that's this seed data's choice, not a schema limitation; a real admin
-- can give any one station's offering different hours via the admin UI.

-- Fuel: 24 hours, every station that offers it.
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, is_24_hours)
SELECT id, d, true
FROM public.station_services, generate_series(0, 6) AS d
WHERE id IN (
  '50000000-0000-0000-0000-000000000011', -- Station 1 fuel
  '50000000-0000-0000-0000-000000000021', -- Station 2 fuel
  '50000000-0000-0000-0000-000000000031'  -- Station 3 fuel
)
ON CONFLICT (station_service_id, day_of_week) DO NOTHING;

-- Car Wash (both tiers, every station offering either): 12:00 PM - 4:00 AM — crosses midnight.
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
SELECT id, d, '12:00'::time, '04:00'::time
FROM public.station_services, generate_series(0, 6) AS d
WHERE id IN (
  '50000000-0000-0000-0000-000000000012', -- Station 1 standard wash
  '50000000-0000-0000-0000-000000000013', -- Station 1 premium wash
  '50000000-0000-0000-0000-000000000022', -- Station 2 standard wash
  '50000000-0000-0000-0000-000000000032', -- Station 3 standard wash
  '50000000-0000-0000-0000-000000000033'  -- Station 3 premium wash
)
ON CONFLICT (station_service_id, day_of_week) DO NOTHING;

-- Oil Change: 10:00 AM - 2:00 AM — also crosses midnight.
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
SELECT id, d, '10:00'::time, '02:00'::time
FROM public.station_services, generate_series(0, 6) AS d
WHERE id IN (
  '50000000-0000-0000-0000-000000000014', -- Station 1 oil change
  '50000000-0000-0000-0000-000000000024'  -- Station 2 oil change
)
ON CONFLICT (station_service_id, day_of_week) DO NOTHING;

-- Café: 5:00 PM - 4:00 AM — also crosses midnight, matches the brief's
-- late-night example exactly.
INSERT INTO public.service_operating_hours (station_service_id, day_of_week, opens_at, closes_at)
SELECT id, d, '17:00'::time, '04:00'::time
FROM public.station_services, generate_series(0, 6) AS d
WHERE id IN (
  '50000000-0000-0000-0000-000000000015', -- Station 1 café
  '50000000-0000-0000-0000-000000000035'  -- Station 3 café
)
ON CONFLICT (station_service_id, day_of_week) DO NOTHING;

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

-- Car wash capabilities — employee_service_capabilities was previously left
-- unseeded even though get_available_slots()/available_employees_for_slot()
-- (supabase/migrations/20240101000230_booking_engine.sql) INNER JOINs
-- against it for any service with requires_employee_selection = true (both
-- car wash tiers). With this table empty, that join always eliminated every
-- candidate, so get_available_slots() returned zero rows for car wash at
-- every station, every date, regardless of operating hours/resources/working
-- hours all being correctly configured. Matches each employee's own bio
-- (02_staff.sql) and the wash tiers their station actually offers here:
-- Station 1 and 3 offer both tiers, Station 2 only Standard. Seeded here,
-- not in 02_staff.sql, because it references services.id — these rows —
-- which don't exist yet when 02_staff.sql runs (seed files apply in
-- filename order).
INSERT INTO public.employee_service_capabilities (employee_id, service_id)
VALUES
  ('20000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000002'), -- Ahmed (Station 1): Car Wash Standard
  ('20000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000003'), -- Ahmed (Station 1): Car Wash Premium
  ('20000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000002'), -- Karim (Station 1): Car Wash Standard
  ('20000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000003'), -- Karim (Station 1): Car Wash Premium
  ('20000000-0000-0000-0000-000000000031', '40000000-0000-0000-0000-000000000002'), -- Sara (Station 2): Car Wash Standard (only tier offered there)
  ('20000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000002'), -- Omar (Station 3): Car Wash Standard
  ('20000000-0000-0000-0000-000000000041', '40000000-0000-0000-0000-000000000003')  -- Omar (Station 3): Car Wash Premium
ON CONFLICT (employee_id, service_id) DO NOTHING;
