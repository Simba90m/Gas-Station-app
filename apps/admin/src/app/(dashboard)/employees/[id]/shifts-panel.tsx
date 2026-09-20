"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createShiftAction, type EmployeeActionState } from "../actions";

export interface ShiftRow {
  id: string;
  stationName: string;
  startedAt: string;
  endedAt: string | null;
}

export interface StationOption {
  id: string;
  nameEn: string;
}

const INITIAL_STATE: EmployeeActionState = {};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ShiftsPanel({
  employeeId,
  shifts,
  stations,
}: {
  employeeId: string;
  shifts: ShiftRow[];
  stations: StationOption[];
}) {
  const [state, formAction, isPending] = useActionState(createShiftAction, INITIAL_STATE);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Starts</th>
              <th className="px-4 py-3 font-medium">Ends</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => (
              <tr key={shift.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{shift.stationName}</td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(shift.startedAt)}</td>
                <td className="px-4 py-3 text-slate-600">{shift.endedAt ? formatDateTime(shift.endedAt) : "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={shift.endedAt ? "gray" : "green"}>{shift.endedAt ? "Completed" : "Active"}</Badge>
                </td>
              </tr>
            ))}
            {shifts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  No shifts recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {stations.length > 0 && (
        <form action={formAction} className="mt-4 space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="shift_station_id">Station</Label>
              <select
                id="shift_station_id"
                name="station_id"
                defaultValue=""
                required
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="" disabled>
                  Choose a station...
                </option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="started_at">Starts</Label>
              <Input id="started_at" name="started_at" type="datetime-local" required />
            </div>
            <div>
              <Label htmlFor="ended_at">Ends</Label>
              <Input id="ended_at" name="ended_at" type="datetime-local" required />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            An overnight shift (e.g. 22:00 → 04:00) just ends on the next calendar day — pick that later date and
            time for &quot;Ends&quot;.
          </p>

          {state.error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create shift"}
          </Button>
        </form>
      )}
    </div>
  );
}
