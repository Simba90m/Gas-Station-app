-- ============================================================================
-- employee_station_schedule: WHICH station an employee works at, on WHICH
-- day, during WHAT time window — replacing the assumption that
-- employee_working_hours (day + time only, no station) fully describes an
-- employee's availability. An employee can now have several rows for the
-- same day at different stations (e.g. Station 1 mornings, Station 2
-- afternoons) or several rows across the week at different stations —
-- employee -> station is no longer treated as a single, permanent
-- relationship for scheduling purposes.
--
-- employee_station_assignments (unchanged by this migration) keeps its
-- existing, narrower role: the coarse "has this employee ever been
-- assigned to this station at all" gate that is_station_staff() and this
-- app's RLS depend on. A schedule row requires a matching assignment row
-- to exist first (enforced by the trigger below) — you can't schedule
-- someone at a station they were never assigned to — but the assignment
-- itself stays a simple yes/no relationship; day/time granularity lives
-- here instead of overloading that table's meaning.
--
-- employee_working_hours (also unchanged, not dropped — see "Preserve
-- existing employee data" in the brief) stops being read by the
-- availability engine as of
-- supabase/migrations/20240101000320_employee_availability_station_schedule.sql,
-- since "when do they work" now has to be answered per station, which
-- that table structurally cannot express (UNIQUE (employee_id,
-- day_of_week) — one row per day, no station column). Existing rows in it
-- are left in place, not migrated automatically: which station each
-- historical day/time block actually belonged to isn't recoverable data,
-- so this is a deliberate "add the new capability without guessing," not
-- a technical limitation. supabase/seed/02_staff.sql adds real
-- employee_station_schedule rows for the demo employees so nothing in the
-- existing seed data goes dark.
--
-- Column shape deliberately mirrors employee_working_hours exactly (plus
-- station_id) — same is_closed/is_24_hours/starts_at/ends_at/
-- break_starts_at/break_ends_at, same is_valid_hours_row() CHECK, same
-- day_window_range() consumption in the availability engine. One
-- "day-window-shaped row" concept, reused a fourth time (station hours,
-- service hours, employee hours, now employee-per-station hours), not a
-- new one invented for this table.
-- ============================================================================
CREATE TABLE public.employee_station_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  is_24_hours boolean NOT NULL DEFAULT false,
  starts_at time,
  ends_at time,
  break_starts_at time,
  break_ends_at time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, station_id, day_of_week),
  CHECK (public.is_valid_hours_row(is_closed, is_24_hours, starts_at, ends_at)),
  CHECK (
    (break_starts_at IS NULL AND break_ends_at IS NULL)
    OR (break_starts_at IS NOT NULL AND break_ends_at IS NOT NULL AND break_starts_at <> break_ends_at)
  )
);

CREATE INDEX employee_station_schedule_employee_id_idx ON public.employee_station_schedule (employee_id);
CREATE INDEX employee_station_schedule_station_id_idx ON public.employee_station_schedule (station_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.employee_station_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- A schedule row's station must be one this employee is actually assigned
-- to (employee_station_assignments) — the same
-- check_assignment_role()/check_customer_role() pattern this codebase
-- already uses for a cross-table invariant a plain FK can't express.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_schedule_station_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employee_station_assignments
    WHERE profile_id = NEW.employee_id AND station_id = NEW.station_id
  ) THEN
    RAISE EXCEPTION 'employee % is not assigned to station % — assign them to the station first', NEW.employee_id, NEW.station_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_schedule_station_assignment
  BEFORE INSERT OR UPDATE OF employee_id, station_id ON public.employee_station_schedule
  FOR EACH ROW EXECUTE FUNCTION public.check_schedule_station_assignment();

-- ----------------------------------------------------------------------------
-- An employee can't physically be at two stations at once: no two rows for
-- the same employee + day_of_week may have overlapping time windows,
-- regardless of which stations they name. Both windows are anchored to the
-- same arbitrary fixed date (only their relative overlap matters) and
-- compared with day_window_range() — the existing, already-correct
-- midnight-crossing-aware helper — via tstzrange's own && operator, rather
-- than hand-rolling time-range overlap logic a second time.
-- ----------------------------------------------------------------------------
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
    AND NOT ess.is_closed
    AND public.day_window_range('2001-01-01'::date, ess.is_closed, ess.is_24_hours, ess.starts_at, ess.ends_at) && v_new_window
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'this overlaps an existing schedule entry at % on the same day — an employee cannot be scheduled at two stations at once', v_conflict.name_en;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_schedule_no_overlap
  BEFORE INSERT OR UPDATE ON public.employee_station_schedule
  FOR EACH ROW EXECUTE FUNCTION public.check_schedule_no_overlap();

-- ----------------------------------------------------------------------------
-- RLS — identical shape to employee_working_hours (self-read, station-staff
-- read/write), just scoped to this row's own station_id directly instead of
-- joining through employee_station_assignments for that part.
-- ----------------------------------------------------------------------------
ALTER TABLE public.employee_station_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_station_schedule FORCE ROW LEVEL SECURITY;

CREATE POLICY employee_station_schedule_select ON public.employee_station_schedule
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_station_staff(station_id));

-- Schedule is manager-set, not self-edited by the employee — same
-- reasoning as employee_working_hours_write.
CREATE POLICY employee_station_schedule_write ON public.employee_station_schedule
  FOR ALL TO authenticated
  USING (public.is_station_staff(station_id))
  WITH CHECK (public.is_station_staff(station_id));
