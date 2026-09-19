-- ============================================================================
-- Extensions
-- ============================================================================

-- Needed for EXCLUDE USING gist constraints that combine an equality check
-- (e.g. "same employee") with a range-overlap check (e.g. "overlapping
-- booking times") — this is how we prevent double-booking at the database
-- level (see the bookings table migration).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- Enums
-- ============================================================================

-- Mirrors packages/types/src/roles.ts — keep both in sync if this changes.
CREATE TYPE public.user_role AS ENUM (
  'OWNER',
  'MANAGER',
  'STATION_MANAGER',
  'EMPLOYEE',
  'CUSTOMER'
);

CREATE TYPE public.booking_status AS ENUM (
  'PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

CREATE TYPE public.queue_status AS ENUM (
  'WAITING',
  'CALLED',
  'IN_SERVICE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

CREATE TYPE public.complaint_status AS ENUM (
  'NEW',
  'IN_REVIEW',
  'INVESTIGATING',
  'RESOLVED',
  'CLOSED'
);

-- Shared by feedback.category and complaints.category — the project brief
-- only defines one such category list (under "Customer feedback"), and
-- reusing it for complaints avoids inventing an unrequested second list.
CREATE TYPE public.issue_category AS ENUM (
  'SERVICE_QUALITY',
  'EMPLOYEE_BEHAVIOR',
  'WAITING_TIME',
  'CLEANLINESS',
  'PRODUCT_QUALITY',
  'PAYMENT',
  'OTHER'
);

CREATE TYPE public.notification_type AS ENUM (
  'BOOKING_CONFIRMATION',
  'BOOKING_REMINDER',
  'BOOKING_CANCELLATION',
  'QUEUE_UPDATE',
  'OFFER',
  'COMPLAINT_STATUS',
  'LOYALTY_REWARD'
);

CREATE TYPE public.discount_type AS ENUM (
  'PERCENTAGE',
  'FIXED_AMOUNT'
);

CREATE TYPE public.resource_status AS ENUM (
  'AVAILABLE',
  'MAINTENANCE',
  'INACTIVE'
);

-- ============================================================================
-- Shared helper functions (used by many tables' migrations below)
-- ============================================================================

-- Every table with `updated_at` attaches this via `BEFORE UPDATE` trigger.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Shared validation for the "opening hours" row shape used by
-- station_operating_hours, service_operating_hours, and
-- employee_working_hours. A row is exactly one of: closed all day, open
-- 24 hours, or open opens_at→closes_at (which may cross midnight, e.g.
-- 22:00→04:00 — that's a normal, valid row; opens_at is simply allowed to
-- be later than closes_at).
CREATE OR REPLACE FUNCTION public.is_valid_hours_row(
  is_closed boolean,
  is_24_hours boolean,
  opens_at time,
  closes_at time
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (is_closed AND NOT is_24_hours AND opens_at IS NULL AND closes_at IS NULL)
    OR (is_24_hours AND NOT is_closed AND opens_at IS NULL AND closes_at IS NULL)
    OR (
      NOT is_closed AND NOT is_24_hours
      AND opens_at IS NOT NULL AND closes_at IS NOT NULL
      AND opens_at <> closes_at
    );
$$;

COMMENT ON FUNCTION public.is_valid_hours_row IS
  'A row is closed all day, open 24 hours, or open opens_at-closes_at (which may cross midnight). Used as a CHECK constraint on *_operating_hours / employee_working_hours tables.';
