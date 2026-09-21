-- ============================================================================
-- Fixes a false-positive in check_schedule_no_overlap()
-- (supabase/migrations/20240101000310_employee_station_schedule.sql): it
-- compared a candidate row against every OTHER row for the same
-- employee_id + day_of_week, excluding only an exact self-match by id
-- (`ess.id IS DISTINCT FROM NEW.id`). That correctly excludes an UPDATE
-- comparing against its own prior row, but NOT an INSERT re-asserting a
-- row that already exists unchanged (a fresh id, identical
-- employee_id/station_id/day_of_week/time window) — e.g. re-running
-- supabase/seed/02_staff.sql, whose
-- `INSERT ... ON CONFLICT (employee_id, station_id, day_of_week) DO
-- NOTHING` relies on the unique constraint to silently skip unchanged
-- rows on a second run. A BEFORE INSERT trigger fires before that
-- conflict resolution, so the trigger saw the not-yet-inserted duplicate
-- as "the same employee, same day, at a DIFFERENT station" (different
-- station_id, since the comparison itself never checked that) and raised,
-- even though the row about to be skipped is for the exact same station.
--
-- Fix: only treat another row as a genuine conflict when it names a
-- DIFFERENT station. The table's own UNIQUE (employee_id, station_id,
-- day_of_week) constraint already guarantees at most one row per
-- employee+station+day, so a same-station comparison here would either be
-- an exact duplicate (harmless — ON CONFLICT DO NOTHING or the unique
-- constraint handles it) or literally impossible (the constraint would
-- have already rejected a second, different-time row for that same
-- station/day). The trigger's actual purpose — "an employee cannot be
-- scheduled at two DIFFERENT stations at once" — only ever needed the
-- cross-station comparison anyway.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_schedule_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_window tstzrange;
  v_conflict record;
BEGIN
  IF NEW.is_closed THEN
    RETURN NEW;
  END IF;

  v_new_window := public.day_window_range('2001-01-01'::date, NEW.is_closed, NEW.is_24_hours, NEW.starts_at, NEW.ends_at);

  SELECT ess.id, s.name_en INTO v_conflict
  FROM public.employee_station_schedule ess
  JOIN public.stations s ON s.id = ess.station_id
  WHERE ess.employee_id = NEW.employee_id
    AND ess.day_of_week = NEW.day_of_week
    AND ess.id IS DISTINCT FROM NEW.id
    AND ess.station_id IS DISTINCT FROM NEW.station_id
    AND NOT ess.is_closed
    AND public.day_window_range('2001-01-01'::date, ess.is_closed, ess.is_24_hours, ess.starts_at, ess.ends_at) && v_new_window
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'this overlaps an existing schedule entry at % on the same day — an employee cannot be scheduled at two stations at once', v_conflict.name_en;
  END IF;

  RETURN NEW;
END;
$$;
