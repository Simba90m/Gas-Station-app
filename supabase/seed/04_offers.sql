-- ============================================================================
-- DEMO / SEED DATA — offers.
--
-- Every INSERT below is guarded (ON CONFLICT ... DO NOTHING, on each table's
-- real primary key or unique constraint) so this file is safe to run more
-- than once — see the note at the top of 01_stations.sql.
-- ============================================================================

INSERT INTO public.offers (id, title_en, title_ar, description_en, description_ar, service_id, discount_type, discount_value, starts_at, ends_at, terms_en, terms_ar, is_active)
VALUES
  (
    '70000000-0000-0000-0000-000000000001',
    'Late Night Wash 20% Off', 'خصم 20% على الغسيل الليلي',
    '20% off any car wash between midnight and 4 AM.', 'خصم 20% على أي غسيل سيارات بين منتصف الليل والساعة 4 صباحًا.',
    NULL, 'PERCENTAGE', 20,
    '2024-06-01 00:00:00+02', '2024-07-01 00:00:00+02',
    'Valid 00:00-04:00 only. Cannot be combined with other offers.', 'يسري من 00:00 إلى 04:00 فقط. لا يمكن الجمع مع عروض أخرى.',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    'Oil Change — 50 EGP Off', 'خصم 50 جنيه على تغيير الزيت',
    'Flat 50 EGP off any oil change service.', 'خصم 50 جنيه مباشر على أي خدمة تغيير زيت.',
    '40000000-0000-0000-0000-000000000004', 'FIXED_AMOUNT', 50,
    '2024-06-01 00:00:00+02', '2024-06-30 23:59:59+02',
    'One use per customer.', 'مرة واحدة لكل عميل.',
    true
  ),
  (
    '70000000-0000-0000-0000-000000000003',
    'Summer Premium Wash Launch', 'إطلاق الغسيل الفاخر الصيفي',
    'Scheduled promotion for later this summer — not active yet.', 'عرض ترويجي مجدول لاحقًا هذا الصيف - غير نشط بعد.',
    '40000000-0000-0000-0000-000000000003', 'PERCENTAGE', 15,
    '2024-08-01 00:00:00+02', '2024-08-31 23:59:59+02',
    'Premium car wash only.', 'الغسيل الفاخر فقط.',
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.offer_stations (offer_id, station_id)
VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003')
ON CONFLICT (offer_id, station_id) DO NOTHING;
