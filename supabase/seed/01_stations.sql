-- ============================================================================
-- DEMO / SEED DATA — fictional stations for local development and testing.
-- None of this represents a real business. See README.md for how to load it.
--
-- Every INSERT below is guarded (ON CONFLICT ... DO NOTHING, on each table's
-- real primary key or unique constraint) so this file is safe to run more
-- than once against the same database — re-running it never creates
-- duplicate rows or errors out on a second run. See README.md "Seeding a
-- hosted development project" for why that matters there.
-- ============================================================================

INSERT INTO public.stations (id, name_en, name_ar, description_en, description_ar, address_en, address_ar, latitude, longitude, phone, is_active)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'Alexandria Station 1', 'محطة الإسكندرية 1',
    'Flagship station on the Stanley Corniche — full services including premium car wash and café.',
    'المحطة الرئيسية على كورنيش ستانلي - خدمات كاملة تشمل غسيل السيارات الفاخر والكافيه.',
    'Corniche Road, Stanley, Alexandria', 'طريق الكورنيش، ستانلي، الإسكندرية',
    31.2156, 29.9553, '+203-4870001', true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'Alexandria Station 2', 'محطة الإسكندرية 2',
    'Neighborhood station in Smouha — fuel, standard car wash, and oil change.',
    'محطة الحي في سموحة - وقود وغسيل سيارات قياسي وتغيير زيت.',
    'Fouad Street, Smouha, Alexandria', 'شارع فؤاد، سموحة، الإسكندرية',
    31.2089, 29.9366, '+203-4870002', true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'Alexandria Station 3', 'محطة الإسكندرية 3',
    'Coastal station near Miami — fuel, car wash, and café, popular for late-night stops.',
    'محطة ساحلية بالقرب من ميامي - وقود وغسيل سيارات وكافيه، مشهورة للتوقف المتأخر ليلاً.',
    'Abu Qir Road, Miami, Alexandria', 'طريق أبو قير، ميامي، الإسكندرية',
    31.2833, 30.0166, '+203-4870003', true
  )
ON CONFLICT (id) DO NOTHING;

-- All three stations are open 24 hours at the STATION level — per the
-- brief's own example, it's individual SERVICES (car wash, café, oil
-- change) that keep shorter, sometimes midnight-crossing hours. See
-- 03_services.sql.
INSERT INTO public.station_operating_hours (station_id, day_of_week, is_24_hours)
SELECT s.id, d.day_of_week, true
FROM public.stations s
CROSS JOIN generate_series(0, 6) AS d (day_of_week)
ON CONFLICT (station_id, day_of_week) DO NOTHING;
