"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DAY_LABELS } from "../../stations/schema";
import { addStationScheduleAction, removeStationScheduleAction, type EmployeeActionState } from "../actions";

export interface ScheduleRow {
  scheduleId: string;
  stationId: string;
  stationName: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export interface StationOption {
  id: string;
  nameEn: string;
}

const INITIAL_STATE: EmployeeActionState = {};

// HTML time inputs give "HH:MM:SS" or "HH:MM" back; the row list below
// always receives "HH:MM:SS" from the database — trims either down to
// "HH:MM" for display, matching how HoursEditor formats times elsewhere.
function formatTime(value: string): string {
  return value.slice(0, 5);
}

function RemoveButton({ employeeId, scheduleId }: { employeeId: string; scheduleId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    setError(undefined);
    startTransition(async () => {
      const result = await removeStationScheduleAction(employeeId, scheduleId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <Button variant="danger" onClick={handleRemove} disabled={isPending}>
        {isPending ? "Removing..." : "Remove"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function StationSchedulePanel({
  employeeId,
  schedule,
  stations,
}: {
  employeeId: string;
  schedule: ScheduleRow[];
  stations: StationOption[];
}) {
  const [state, formAction, isPending] = useActionState(addStationScheduleAction, INITIAL_STATE);

  // Sorted by day then station so the owner reads it the way a weekly
  // calendar would — e.g. the brief's own Monday/Tuesday/Wednesday example.
  const sortedSchedule = [...schedule].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.stationName.localeCompare(b.stationName));

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Day</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sortedSchedule.map((row) => (
              <tr key={row.scheduleId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{row.stationName}</td>
                <td className="px-4 py-3 text-slate-600">{DAY_LABELS[row.dayOfWeek]}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatTime(row.startsAt)}–{formatTime(row.endsAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <RemoveButton employeeId={employeeId} scheduleId={row.scheduleId} />
                </td>
              </tr>
            ))}
            {sortedSchedule.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  No station schedule set yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {stations.length > 0 ? (
        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className="w-40">
            <Label htmlFor="schedule_station_id">Station</Label>
            <select
              id="schedule_station_id"
              name="station_id"
              defaultValue=""
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="" disabled>
                Choose...
              </option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.nameEn}
                </option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <Label htmlFor="schedule_day_of_week">Day</Label>
            <select
              id="schedule_day_of_week"
              name="day_of_week"
              defaultValue=""
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="" disabled>
                Choose...
              </option>
              {DAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <Label htmlFor="schedule_starts_at">Start</Label>
            <input
              id="schedule_starts_at"
              name="starts_at"
              type="time"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div className="w-28">
            <Label htmlFor="schedule_ends_at">End</Label>
            <input
              id="schedule_ends_at"
              name="ends_at"
              type="time"
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding..." : "+ Add station assignment"}
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Assign this employee to a station above first.</p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
