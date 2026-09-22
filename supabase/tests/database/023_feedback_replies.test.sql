-- Verifies feedback_replies RLS: OWNER can post a reply to any feedback
-- (and responded_by is always the real caller, never client-supplied); a
-- STATION_MANAGER assigned to the feedback's own station can post a reply;
-- a STATION_MANAGER assigned to a DIFFERENT station cannot (station-scoped,
-- not role-only); a plain EMPLOYEE at the same station cannot; the
-- feedback's own customer can read every reply; an unrelated customer
-- cannot.
BEGIN;
SELECT plan(7);

-- Privileged fixture setup (see 003_rls_customer_isolation.test.sql for why).
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-0000-0000-000000001401', 'fbr-owner@example.com'),
  ('a0000000-0000-0000-0000-000000001402', 'fbr-station-mgr@example.com'),
  ('a0000000-0000-0000-0000-000000001403', 'fbr-customer@example.com'),
  ('a0000000-0000-0000-0000-000000001404', 'fbr-other-customer@example.com'),
  ('a0000000-0000-0000-0000-000000001405', 'fbr-other-station-mgr@example.com'),
  ('a0000000-0000-0000-0000-000000001406', 'fbr-employee@example.com');

UPDATE public.profiles SET role = 'OWNER' WHERE id = 'a0000000-0000-0000-0000-000000001401';
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001402';
UPDATE public.profiles SET role = 'STATION_MANAGER' WHERE id = 'a0000000-0000-0000-0000-000000001405';
UPDATE public.profiles SET role = 'EMPLOYEE' WHERE id = 'a0000000-0000-0000-0000-000000001406';

INSERT INTO public.stations (id, name_en, name_ar, address_en, address_ar, latitude, longitude)
VALUES
  ('a0000000-0000-0000-0000-000000001410', 'Test Station', 'محطة اختبار', 'Addr', 'عنوان', 31.2, 29.9),
  ('a0000000-0000-0000-0000-000000001411', 'Other Station', 'محطة أخرى', 'Addr 2', 'عنوان 2', 31.3, 30.0);

-- 1402 manages the feedback's own station; 1405 manages a DIFFERENT
-- station; 1406 is a plain EMPLOYEE at the feedback's own station.
INSERT INTO public.employee_station_assignments (profile_id, station_id) VALUES
  ('a0000000-0000-0000-0000-000000001402', 'a0000000-0000-0000-0000-000000001410'),
  ('a0000000-0000-0000-0000-000000001405', 'a0000000-0000-0000-0000-000000001411'),
  ('a0000000-0000-0000-0000-000000001406', 'a0000000-0000-0000-0000-000000001410');

INSERT INTO public.services (id, name_en, name_ar, base_price, duration_minutes)
VALUES ('a0000000-0000-0000-0000-000000001420', 'Test Service', 'خدمة اختبار', 50, 15);
INSERT INTO public.station_services (id, station_id, service_id)
VALUES ('a0000000-0000-0000-0000-000000001430', 'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001420');

INSERT INTO public.bookings (id, customer_id, station_id, station_service_id, time_range, status, price)
VALUES ('a0000000-0000-0000-0000-000000001440', 'a0000000-0000-0000-0000-000000001403',
        'a0000000-0000-0000-0000-000000001410', 'a0000000-0000-0000-0000-000000001430',
        tstzrange('2024-06-15 09:00:00+02', '2024-06-15 09:15:00+02'), 'COMPLETED', 50);

INSERT INTO public.feedback (id, booking_id, rating, category, comment)
VALUES ('a0000000-0000-0000-0000-000000001450', 'a0000000-0000-0000-0000-000000001440', 3, 'WAITING_TIME', 'Took a while.');

-- OWNER posts a reply. Also tries to spoof responded_by as the customer —
-- the BEFORE INSERT trigger must overwrite it with the real caller anyway.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001401';

SELECT lives_ok(
  $$ INSERT INTO public.feedback_replies (feedback_id, responded_by, message)
     VALUES ('a0000000-0000-0000-0000-000000001450', 'a0000000-0000-0000-0000-000000001403', 'Thanks for the feedback, we are working on it.') $$,
  'OWNER can post a reply to any feedback row'
);

SELECT is(
  (SELECT responded_by FROM public.feedback_replies WHERE feedback_id = 'a0000000-0000-0000-0000-000000001450')::uuid,
  'a0000000-0000-0000-0000-000000001401'::uuid,
  'responded_by is set to the real caller, ignoring the client-supplied value'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001402';

SELECT lives_ok(
  $$ INSERT INTO public.feedback_replies (feedback_id, message)
     VALUES ('a0000000-0000-0000-0000-000000001450', 'Following up from the station.') $$,
  'a STATION_MANAGER assigned to the feedback''s own station can post a reply'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001405';

SELECT throws_ok(
  $$ INSERT INTO public.feedback_replies (feedback_id, message)
     VALUES ('a0000000-0000-0000-0000-000000001450', 'Should not be allowed.') $$,
  NULL::char(5), NULL,
  'a STATION_MANAGER assigned to a DIFFERENT station cannot post a reply'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001406';

SELECT throws_ok(
  $$ INSERT INTO public.feedback_replies (feedback_id, message)
     VALUES ('a0000000-0000-0000-0000-000000001450', 'Should not be allowed either.') $$,
  NULL::char(5), NULL,
  'a plain EMPLOYEE at the feedback''s own station cannot post a reply'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001403';

SELECT is(
  (SELECT count(*) FROM public.feedback_replies WHERE feedback_id = 'a0000000-0000-0000-0000-000000001450')::int,
  2,
  'the feedback''s own customer can read both successful replies (OWNER + STATION_MANAGER)'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000001404';

SELECT is(
  (SELECT count(*) FROM public.feedback_replies WHERE feedback_id = 'a0000000-0000-0000-0000-000000001450')::int,
  0,
  'an unrelated customer cannot read the replies'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
