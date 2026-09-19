-- ============================================================================
-- DEMO / SEED DATA — bookings and a walk-up queue.
-- Reference "today" for this seed data is 2024-06-15 (a Saturday), Africa/
-- Cairo time. Cairo observes DST (+03:00 in summer, +02:00 in winter) — June
-- is +03:00; see packages/utils/src/operating-day.ts, which computes this
-- from the real timezone database rather than a hardcoded offset. Booking 2
-- below deliberately crosses midnight into 2024-06-16, demonstrating the
-- late-night rule end to end.
-- ============================================================================

-- 1. COMPLETED: Station 1, Oil Change, daytime, no resource/employee needed.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
VALUES (
  '60000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000014',
  NULL, NULL,
  tstzrange('2024-06-15 11:00:00+03', '2024-06-15 11:30:00+03'),
  'COMPLETED', 250
);

-- 2. COMPLETED: Station 1, Premium Car Wash, 23:45 -> 00:15 next day —
-- crosses midnight, served by the night-shift employee (Karim) in the
-- premium bay. This is the concrete midnight-crossing booking example.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
VALUES (
  '60000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000013',
  (SELECT id FROM public.service_resources WHERE station_service_id = '50000000-0000-0000-0000-000000000013' AND name_en = 'Premium Bay'),
  '20000000-0000-0000-0000-000000000022',
  tstzrange('2024-06-15 23:45:00+03', '2024-06-16 00:15:00+03'),
  'COMPLETED', 180
);

-- 3. CONFIRMED: Station 2, Standard Car Wash, upcoming afternoon slot.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
VALUES (
  '60000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000022',
  (SELECT id FROM public.service_resources WHERE station_service_id = '50000000-0000-0000-0000-000000000022' AND name_en = 'Bay 1'),
  '20000000-0000-0000-0000-000000000031',
  tstzrange('2024-06-16 14:00:00+03', '2024-06-16 14:30:00+03'),
  'CONFIRMED', 70
);

-- 4. CANCELLED: customer cancelled a standard wash at Station 1.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price, cancellation_reason)
VALUES (
  '60000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000012',
  (SELECT id FROM public.service_resources WHERE station_service_id = '50000000-0000-0000-0000-000000000012' AND name_en = 'Bay 1'),
  '20000000-0000-0000-0000-000000000021',
  tstzrange('2024-06-17 10:00:00+03', '2024-06-17 10:30:00+03'),
  'CANCELLED', 80, 'Plans changed.'
);

-- 5. PENDING: Station 3, Premium Car Wash, late-night slot next week.
INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, resource_id, employee_id, time_range, status, price)
VALUES (
  '60000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000033',
  (SELECT id FROM public.service_resources WHERE station_service_id = '50000000-0000-0000-0000-000000000033' AND name_en = 'Premium Bay'),
  NULL,
  tstzrange('2024-06-20 01:00:00+03', '2024-06-20 01:45:00+03'),
  'PENDING', 200
);

-- ============================================================================
-- A walk-up queue at Station 2 for fuel (no booking needed) — demonstrates
-- the queue system for customers who didn't book in advance.
-- ============================================================================
INSERT INTO public.queues (id, station_id, station_service_id, is_open)
VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000021', true);

INSERT INTO public.queue_entries (queue_id, customer_id, position, estimated_wait_minutes, status, called_at, completed_at)
VALUES
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 1, 0, 'COMPLETED', '2024-06-15 09:05:00+03', '2024-06-15 09:10:00+03'),
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 2, 5, 'CALLED', '2024-06-15 09:12:00+03', NULL),
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 3, 12, 'WAITING', NULL, NULL);
