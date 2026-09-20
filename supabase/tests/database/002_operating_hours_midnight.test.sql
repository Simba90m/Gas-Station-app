-- Verifies the schema correctly supports operating hours that cross
-- midnight (e.g. car wash 22:00-04:00), per the project brief's explicit
-- "do not assume end_time must always be later than start_time" rule.
BEGIN;
SELECT plan(5);

-- is_valid_hours_row: the shared validation function used by
-- station_operating_hours / service_operating_hours / employee_working_hours.
SELECT ok(
  public.is_valid_hours_row(false, false, '22:00', '04:00'),
  'opens_at (22:00) later than closes_at (04:00) is a VALID row — it means crossing midnight'
);
SELECT ok(
  public.is_valid_hours_row(false, false, '10:00', '18:00'),
  'a normal same-day window is still valid'
);
SELECT ok(
  NOT public.is_valid_hours_row(false, false, '10:00', '10:00'),
  'identical opens_at/closes_at is invalid (ambiguous — use is_24_hours instead)'
);
SELECT ok(
  NOT public.is_valid_hours_row(true, false, '10:00', '18:00'),
  'is_closed=true with opens_at/closes_at set is invalid'
);

-- Privileged fixture setup: npx supabase test db --linked connects as
-- cli_login_postgres, which has no direct grant on public.stations
-- (unlike local Docker, where the connecting role is a real superuser).
-- It IS a member of postgres, so SET LOCAL ROLE assumes that membership for
-- this insert only, scoped to this transaction — no GRANT involved.
SET LOCAL ROLE postgres;

-- A real midnight-crossing row can actually be inserted and stored.
INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES ('a0000000-0000-0000-0000-000000000110', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9);

INSERT INTO public.station_operating_hours (station_id, day_of_week, opens_at, closes_at)
VALUES ('a0000000-0000-0000-0000-000000000110', 3, '22:00', '04:00');

SELECT is(
  (SELECT opens_at > closes_at FROM public.station_operating_hours WHERE station_id = 'a0000000-0000-0000-0000-000000000110'),
  true,
  'a midnight-crossing station_operating_hours row is stored with opens_at > closes_at, unmodified'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
