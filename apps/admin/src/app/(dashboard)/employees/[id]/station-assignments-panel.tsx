"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { assignStationAction, removeStationAssignmentAction, type EmployeeActionState } from "../actions";

export interface AssignmentRow {
  assignmentId: string;
  stationId: string;
  stationName: string;
  isPrimary: boolean;
}

export interface StationOption {
  id: string;
  nameEn: string;
}

const INITIAL_STATE: EmployeeActionState = {};

function RemoveButton({ employeeId, assignmentId }: { employeeId: string; assignmentId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    setError(undefined);
    startTransition(async () => {
      const result = await removeStationAssignmentAction(employeeId, assignmentId);
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

export function StationAssignmentsPanel({
  employeeId,
  assignments,
  available,
}: {
  employeeId: string;
  assignments: AssignmentRow[];
  available: StationOption[];
}) {
  const [state, formAction, isPending] = useActionState(assignStationAction, INITIAL_STATE);

  // The <select> below is a CONTROLLED component: its value lives in this
  // state, updated by onChange, and the form submits that exact value (via
  // the select's `value` prop, which keeps the DOM in sync with this state
  // rather than relying on an uncontrolled default that a stray re-render
  // could reset). wasPending tracks the previous isPending value across
  // renders so the effect below can detect the exact "a submission just
  // finished successfully" moment (isPending flips true -> false with no
  // error) and reset the select back to the placeholder then — not on
  // mount, and not while still pending.
  const [selectedStationId, setSelectedStationId] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      setSelectedStationId("");
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.assignmentId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {assignment.stationName}
                  {assignment.isPrimary && (
                    <Badge tone="gray" className="ml-2">
                      Primary
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <RemoveButton employeeId={employeeId} assignmentId={assignment.assignmentId} />
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                  Not assigned to any station yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {available.length > 0 && (
        <form action={formAction} className="mt-4 flex items-end gap-3">
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className="flex-1 max-w-xs">
            <Label htmlFor="station_id">Assign to a station</Label>
            <select
              id="station_id"
              name="station_id"
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="" disabled>
                Choose a station...
              </option>
              {available.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.nameEn}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Assigning..." : "Assign"}
          </Button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
