-- Verifies the three idempotency patterns used throughout supabase/seed/
-- (see README.md "Seeding a hosted development project") actually behave
-- as intended: running the same INSERT twice must never create a
-- duplicate row, and — for a table with an INSERT trigger that has a
-- side effect (loyalty_transactions crediting points) — must never apply
-- that side effect twice either. This runs as the same role the seed
-- files themselves run as (no SET LOCAL ROLE authenticated), matching how
-- `supabase db push --include-seed` / `supabase db reset` actually apply them.
BEGIN;
SELECT plan(4);

-- ------------------------------------------------------------------------
-- Pattern 1: ON CONFLICT (id) DO NOTHING, keyed on an explicit hardcoded
-- primary key — used for stations, services, offers, bookings, etc.
-- ------------------------------------------------------------------------
INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000801', 'Idempotency Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000801', 'Idempotency Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9)
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT count(*) FROM public.stations WHERE id = 'a0000000-0000-0000-0000-000000000801')::int,
  1,
  'ON CONFLICT (id) DO NOTHING: running the same INSERT twice leaves exactly one row'
);

-- ------------------------------------------------------------------------
-- Pattern 2: ON CONFLICT (composite unique) DO NOTHING, keyed on a natural
-- unique constraint rather than an explicit id — used for
-- station_operating_hours, service_operating_hours, employee_working_hours,
-- offer_stations, etc.
-- ------------------------------------------------------------------------
INSERT INTO public.station_operating_hours (station_id, day_of_week, is_24_hours)
VALUES ('a0000000-0000-0000-0000-000000000801', 0, true)
ON CONFLICT (station_id, day_of_week) DO NOTHING;
INSERT INTO public.station_operating_hours (station_id, day_of_week, is_24_hours)
VALUES ('a0000000-0000-0000-0000-000000000801', 0, true)
ON CONFLICT (station_id, day_of_week) DO NOTHING;

SELECT is(
  (SELECT count(*) FROM public.station_operating_hours WHERE station_id = 'a0000000-0000-0000-0000-000000000801')::int,
  1,
  'ON CONFLICT (station_id, day_of_week) DO NOTHING: no duplicate row on a second run'
);

-- ------------------------------------------------------------------------
-- Pattern 3: WHERE NOT EXISTS guard, for a table with no usable unique
-- constraint — used for shifts, queue_entries, loyalty_transactions.
-- loyalty_transactions is the highest-stakes case: its INSERT trigger
-- (apply_loyalty_transaction) mutates loyalty_accounts.points_balance, so a
-- duplicate INSERT wouldn't just duplicate a row, it would double-award
-- points.
-- ------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000802', 'idempotency-customer@example.com');

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000000804', 'Test Service', 'خدمة اختبار', 50, 15);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000000805', 'a0000000-0000-0000-0000-000000000801', 'a0000000-0000-0000-0000-000000000804');

INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES (
  'a0000000-0000-0000-0000-000000000803', 'a0000000-0000-0000-0000-000000000802',
  'a0000000-0000-0000-0000-000000000801', 'a0000000-0000-0000-0000-000000000805',
  tstzrange('2024-06-15 09:00:00+02', '2024-06-15 09:15:00+02'), 'COMPLETED', 50
);

-- Run the same WHERE NOT EXISTS-guarded INSERT twice, exactly like the
-- seed file does.
INSERT INTO public.loyalty_transactions (loyalty_account_id, points, reason, booking_id)
SELECT v.loyalty_account_id, v.points, v.reason, v.booking_id
FROM (
  VALUES ((SELECT id FROM public.loyalty_accounts WHERE customer_id = 'a0000000-0000-0000-0000-000000000802'), 25, 'Test', 'a0000000-0000-0000-0000-000000000803'::uuid)
) AS v (loyalty_account_id, points, reason, booking_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.loyalty_transactions lt
  WHERE lt.loyalty_account_id = v.loyalty_account_id AND lt.booking_id = v.booking_id
);
INSERT INTO public.loyalty_transactions (loyalty_account_id, points, reason, booking_id)
SELECT v.loyalty_account_id, v.points, v.reason, v.booking_id
FROM (
  VALUES ((SELECT id FROM public.loyalty_accounts WHERE customer_id = 'a0000000-0000-0000-0000-000000000802'), 25, 'Test', 'a0000000-0000-0000-0000-000000000803'::uuid)
) AS v (loyalty_account_id, points, reason, booking_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.loyalty_transactions lt
  WHERE lt.loyalty_account_id = v.loyalty_account_id AND lt.booking_id = v.booking_id
);

SELECT is(
  (SELECT count(*) FROM public.loyalty_transactions WHERE booking_id = 'a0000000-0000-0000-0000-000000000803')::int,
  1,
  'WHERE NOT EXISTS guard: no duplicate loyalty_transactions row on a second run'
);
SELECT is(
  (SELECT points_balance FROM public.loyalty_accounts WHERE customer_id = 'a0000000-0000-0000-0000-000000000802'),
  25,
  'points_balance reflects the award exactly once, not twice, on a second run'
);

SELECT * FROM finish();
ROLLBACK;
