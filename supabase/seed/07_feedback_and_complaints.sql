-- ============================================================================
-- DEMO / SEED DATA — feedback, complaints, and loyalty activity.
-- ============================================================================

-- Feedback for the two COMPLETED bookings. customer_id/station_id/
-- station_service_id/employee_id are populated automatically by the
-- populate_feedback_from_booking trigger from the booking itself.
INSERT INTO public.feedback (booking_id, rating, category, comment)
VALUES
  ('60000000-0000-0000-0000-000000000001', 5, 'SERVICE_QUALITY', 'Quick and professional oil change.'),
  ('60000000-0000-0000-0000-000000000002', 4, 'WAITING_TIME', 'Great wash, but the late-night bay took a few minutes to open up.');

-- A complaint, including an internal note — internal_notes is set with a
-- direct UPDATE (we're seeding as the postgres superuser, which bypasses
-- both RLS and the column-privilege restriction), not through
-- set_complaint_internal_notes(), for the same reason role promotion above
-- used a direct UPDATE: that function requires a real authenticated session.
INSERT INTO public.complaints (id, customer_id, station_id, booking_id, employee_id, category, description, status)
VALUES (
  '90000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000002',
  NULL, NULL,
  'WAITING_TIME',
  'Waited over 20 minutes in the fuel queue during the morning rush.',
  'IN_REVIEW'
);

UPDATE public.complaints
SET internal_notes = 'Checked with Station 2 team — one pump was down for maintenance that morning, now resolved. Following up with customer.'
WHERE id = '90000000-0000-0000-0000-000000000001';

-- Loyalty: award points for the two completed bookings (business rule
-- "1 point per 10 EGP spent" is illustrative only — no such rule is
-- configured/enforced yet, per the brief's "don't over-engineer loyalty
-- initially").
INSERT INTO public.loyalty_transactions (loyalty_account_id, points, reason, booking_id)
VALUES
  (
    (SELECT id FROM public.loyalty_accounts WHERE customer_id = '30000000-0000-0000-0000-000000000001'),
    25, 'Completed booking: Oil Change', '60000000-0000-0000-0000-000000000001'
  ),
  (
    (SELECT id FROM public.loyalty_accounts WHERE customer_id = '30000000-0000-0000-0000-000000000002'),
    18, 'Completed booking: Car Wash Premium', '60000000-0000-0000-0000-000000000002'
  );
