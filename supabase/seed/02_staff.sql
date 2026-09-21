-- ============================================================================
-- DEMO / SEED DATA — staff accounts.
--
-- Inserting directly into auth.users (rather than going through real
-- sign-up) is a standard way to seed demo accounts for local development.
-- Every demo account uses the password 'password123' — never do this for a
-- real deployment; it's only safe because these are fictional accounts on a
-- local/dev database.
--
-- Every INSERT below is guarded (ON CONFLICT / WHERE NOT EXISTS, on each
-- table's real primary key or unique constraint) so this file is safe to
-- run more than once — see the note at the top of 01_stations.sql.
--
-- crypt()/gen_salt() are schema-qualified (extensions.crypt(...)) rather
-- than bare — see supabase/migrations/20240101000170_pgcrypto_extension.sql
-- for why: on a hosted project, pgcrypto lives in the `extensions` schema,
-- which isn't on the search_path for the connection `supabase db push`
-- uses, so a bare gen_salt('bf') fails with "function ... does not exist"
-- even though the extension is installed.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmed Fathy","phone":"+201001111111"}'),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'manager@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Mona Sherif","phone":"+201001111112"}'),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'manager.station1@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hassan Ibrahim","phone":"+201001111121"}'),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'manager.station2@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Laila Adel","phone":"+201001111122"}'),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'manager.station3@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Tarek Younis","phone":"+201001111123"}'),
  -- Station 1 employees: one day-shift, one night-shift (crosses midnight)
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'ahmed.wash@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ahmed Samir","phone":"+201001111211"}'),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'karim.wash@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Karim Nabil","phone":"+201001111212"}'),
  -- Station 2 employees
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'sara.wash@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sara Mostafa","phone":"+201001111311"}'),
  -- Station 3 employees
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'omar.wash@demo.gasstation.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Omar Khaled","phone":"+201001111411"}')
ON CONFLICT (id) DO NOTHING;

-- The trigger on auth.users (handle_new_user) already created a CUSTOMER
-- profile + customers row + loyalty account for every one of the above.
-- Promote each to their real role. Done as direct UPDATEs (we're seeding as
-- the postgres superuser, which bypasses RLS) rather than through the
-- set_profile_role() function, since that function requires an
-- authenticated OWNER/MANAGER session (auth.uid()), which doesn't exist
-- during seeding.
UPDATE public.profiles SET role = 'OWNER' WHERE id = '20000000-0000-0000-0000-000000000001';
UPDATE public.profiles SET role = 'MANAGER' WHERE id = '20000000-0000-0000-0000-000000000002';
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id IN (
  '20000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000012',
  '20000000-0000-0000-0000-000000000013'
);
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id IN (
  '20000000-0000-0000-0000-000000000021',
  '20000000-0000-0000-0000-000000000022',
  '20000000-0000-0000-0000-000000000031',
  '20000000-0000-0000-0000-000000000041'
);

-- Promoting to EMPLOYEE doesn't need a customers/loyalty row — leaving the
-- ones auto-created by the signup trigger in place is harmless (nobody will
-- book a "car wash" for a staff account), consistent with keeping this
-- phase's role-transition handling simple (see docs/ARCHITECTURE.md).

INSERT INTO public.employees (id, hire_date, bio_en, bio_ar)
VALUES
  ('20000000-0000-0000-0000-000000000021', '2022-03-01', 'Day-shift car wash specialist.', 'متخصص غسيل سيارات في الوردية النهارية.'),
  ('20000000-0000-0000-0000-000000000022', '2023-01-15', 'Night-shift car wash specialist.', 'متخصص غسيل سيارات في الوردية الليلية.'),
  ('20000000-0000-0000-0000-000000000031', '2022-07-10', 'Car wash and oil change technician.', 'فني غسيل سيارات وتغيير زيت.'),
  ('20000000-0000-0000-0000-000000000041', '2023-05-20', 'Car wash specialist, night shift.', 'متخصص غسيل سيارات، وردية ليلية.')
ON CONFLICT (id) DO NOTHING;

-- Station manager + employee assignments
INSERT INTO public.employee_station_assignments (profile_id, station_id, is_primary)
VALUES
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', true),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', true),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000002', true),
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000003', true)
ON CONFLICT (profile_id, station_id) DO NOTHING;

-- Working hours: Ahmed (day shift) and Karim (night shift, crosses
-- midnight) cover Station 1's car wash across the whole day between them —
-- this is what makes the midnight-crossing booking in 06_bookings.sql valid
-- against an employee's actual schedule.
INSERT INTO public.employee_working_hours (employee_id, day_of_week, starts_at, ends_at)
SELECT '20000000-0000-0000-0000-000000000021'::uuid, d, '08:00'::time, '20:00'::time FROM generate_series(0, 6) AS d
UNION ALL
SELECT '20000000-0000-0000-0000-000000000022'::uuid, d, '20:00'::time, '08:00'::time FROM generate_series(0, 6) AS d
UNION ALL
SELECT '20000000-0000-0000-0000-000000000031'::uuid, d, '08:00'::time, '22:00'::time FROM generate_series(0, 6) AS d
UNION ALL
SELECT '20000000-0000-0000-0000-000000000041'::uuid, d, '18:00'::time, '04:00'::time FROM generate_series(0, 6) AS d
ON CONFLICT (employee_id, day_of_week) DO NOTHING;

-- Car wash capabilities (employee_service_capabilities) are seeded in
-- 03_services.sql, not here — that table's service_id foreign key needs
-- public.services to exist first, and 03_services.sql is where those rows
-- get created; seed files run in filename order, so 02 running before 03
-- means the service rows don't exist yet at this point.

-- A couple of demo shifts, including one still active (no ended_at) to show
-- what "currently on shift" looks like. shifts has no natural unique
-- constraint to key an ON CONFLICT off (the partial unique index only
-- enforces "one active shift at a time"), so this uses an explicit
-- WHERE NOT EXISTS guard instead — same idempotency goal, matched to what
-- the table actually allows.
INSERT INTO public.shifts (employee_id, station_id, started_at, ended_at)
SELECT v.employee_id, v.station_id, v.started_at, v.ended_at
FROM (
  VALUES
    ('20000000-0000-0000-0000-000000000021'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2024-06-15 08:00:00+02'::timestamptz, '2024-06-15 20:00:00+02'::timestamptz),
    ('20000000-0000-0000-0000-000000000022'::uuid, '10000000-0000-0000-0000-000000000001'::uuid, '2024-06-15 20:00:00+02'::timestamptz, NULL::timestamptz)
) AS v (employee_id, station_id, started_at, ended_at)
WHERE NOT EXISTS (
  SELECT 1 FROM public.shifts s
  WHERE s.employee_id = v.employee_id AND s.station_id = v.station_id AND s.started_at = v.started_at
);
