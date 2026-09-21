-- ============================================================================
-- available_employees_for_slot(): now answers "who is scheduled at THIS
-- station, on this day, for this time window" from
-- employee_station_schedule (supabase/migrations/20240101000310_employee_station_schedule.sql)
-- instead of employee_working_hours — the same five checks the product
-- brief lists (active, has the capability, assigned to the requested
-- station, working hours allow this date/time, no conflicting booking) are
-- still all here; "assigned to the requested station at that date/time"
-- and "working hours allow that date/time" are now the SAME source of
-- truth (a schedule row for that station/day) rather than two separate,
-- potentially-contradictory tables (a permanent station assignment plus
-- station-agnostic global hours) — which is exactly what "do NOT treat
-- Employee -> Station as a permanent one-to-one relationship" rules out.
--
-- employee_station_assignments is still joined too — a schedule row's
-- station is already guaranteed (by 000310's trigger) to be one the
-- employee is assigned to, so this join is redundant in principle, but
-- costs nothing and keeps this function's own logic self-evidently
-- correct without relying on that trigger's invariant holding.
--
-- Signature, callers, and every other function in the booking engine are
-- completely unchanged — get_available_slots(), _create_booking_core(),
-- create_booking(), start_queue_service() all call this exact function
-- and need no changes themselves.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.available_employees_for_slot(
  p_station_id uuid,
  p_service_id uuid,
  p_date date,
  p_slot tstzrange,
  p_employee_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  WITH candidates AS (
    SELECT
      e.id,
      public.day_window_range(p_date, ess.is_closed, ess.is_24_hours, ess.starts_at, ess.ends_at) AS working_window,
      public.day_window_range(p_date, ess.break_starts_at IS NULL, false, ess.break_starts_at, ess.break_ends_at) AS break_window
    FROM public.employees e
    JOIN public.employee_station_assignments esa ON esa.profile_id = e.id AND esa.station_id = p_station_id
    JOIN public.employee_service_capabilities esc ON esc.employee_id = e.id AND esc.service_id = p_service_id
    JOIN public.employee_station_schedule ess
      ON ess.employee_id = e.id AND ess.station_id = p_station_id AND ess.day_of_week = EXTRACT(DOW FROM p_date)
    WHERE e.is_active = true
      AND (p_employee_id IS NULL OR e.id = p_employee_id)
  )
  SELECT c.id
  FROM candidates c
  WHERE c.working_window IS NOT NULL
    AND c.working_window @> p_slot
    AND (c.break_window IS NULL OR NOT (c.break_window && p_slot))
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.employee_id = c.id
        AND b.status NOT IN ('CANCELLED', 'NO_SHOW')
        AND b.time_range && p_slot
    )
  ORDER BY c.id;
$$;
