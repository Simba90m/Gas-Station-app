-- ============================================================================
-- DEMO / SEED DATA — feedback, complaints, and loyalty activity.
--
-- Every INSERT below is guarded (ON CONFLICT / WHERE NOT EXISTS, on each
-- table's real primary key or unique constraint) so this file is safe to
-- run more than once — see the note at the top of 01_stations.sql.
-- ============================================================================

-- Feedback for the two COMPLETED bookings. customer_id/station_id/
-- station_service_id/employee_id are populated automatically by the
-- populate_feedback_from_booking trigger from the booking itself.
-- feedback.booking_id is UNIQUE, so that's the natural ON CONFLICT target.
INSERT INTO public.feedback (booking_id, rating, category, comment)
VALUES
  ('60000000-0000-0000-0000-000000000001', 5, 'SERVICE_QUALITY', 'Quick and professional oil change.'),
  ('60000000-0000-0000-0000-000000000002', 4, 'WAITING_TIME', 'Great wash, but the late-night bay took a few minutes to open up.')
ON CONFLICT (booking_id) DO NOTHING;

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
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.complaints
SET internal_notes = 'Checked with Station 2 team — one pump was down for maintenance that morning, now resolved. Following up with customer.'
WHERE id = '90000000-0000-0000-0000-000000000001';

-- Loyalty: award points for the two completed bookings (business rule
-- "1 point per 10 EGP spent" is illustrative only — no such rule is
-- configured/enforced yet, per the brief's "don't over-engineer loyalty
-- initially"). loyalty_transactions has no natural unique constraint to key
-- an ON CONFLICT off, so this uses an explicit WHERE NOT EXISTS guard on
-- (loyalty_account_id, booking_id) instead — also the right rule in spirit,
-- since a given booking should only ever award points once. This matters
-- more here than most tables: every INSERT also fires
-- apply_loyalty_transaction, which adds to the account's points_balance, so
-- skipping the duplicate INSERT is what stops a rerun from double-counting
-- points, not just from creating a duplicate row.
INSERT INTO public.loyalty_transactions (loyalty_account_id, points, reason, booking_id)
SELECT v.loyalty_account_id, v.points, v.reason, v.booking_id
FROM (
  VALUES
    (
      (SELECT id FROM public.loyalty_accounts WHERE customer_id = '30000000-0000-0000-0000-000000000001'),
      25, 'Completed booking: Oil Change', '60000000-0000-0000-0000-000000000001'::uuid
    ),
    (
      (SELECT id FROM public.loyalty_accounts WHERE customer_id = '30000000-0000-0000-0000-000000000002'),
      18, 'Completed booking: Car Wash Premium', '60000000-0000-0000-0000-000000000002'::uuid
    )
) AS v (loyalty_account_id, points, reason, booking_id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.loyalty_transactions lt
  WHERE lt.loyalty_account_id = v.loyalty_account_id AND lt.booking_id = v.booking_id
);
