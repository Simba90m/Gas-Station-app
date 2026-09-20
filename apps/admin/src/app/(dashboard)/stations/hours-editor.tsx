"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DAY_LABELS, type HourRowInput, type HoursMode } from "./schema";

export interface InitialHourRow {
  day_of_week: number;
  is_closed: boolean;
  is_24_hours: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

function toRow(existing: InitialHourRow | undefined, dayOfWeek: number): HourRowInput {
  if (!existing) {
    return { day_of_week: dayOfWeek, mode: "closed", opens_at: "", closes_at: "" };
  }
  const mode: HoursMode = existing.is_24_hours ? "24h" : existing.is_closed ? "closed" : "custom";
  return {
    day_of_week: dayOfWeek,
    mode,
    opens_at: existing.opens_at?.slice(0, 5) ?? "",
    closes_at: existing.closes_at?.slice(0, 5) ?? "",
  };
}

interface HoursEditorProps {
  initialRows: InitialHourRow[];
  /**
   * Persists the full week of rows. Passed in from a Server Component as a
   * Server Action bound to whatever id it already has in scope — e.g.
   * `upsertStationHoursAction.bind(null, stationId)` or
   * `upsertServiceHoursAction.bind(null, stationId, stationServiceId)` —
   * never an inline arrow function. A plain closure isn't a real Server
   * Action reference, so React can't serialize it across the Server →
   * Client Component boundary ("Event handlers cannot be passed to Client
   * Component props"); a bound Server Action is specifically what that
   * boundary supports.
   */
  onSave: (rows: HourRowInput[]) => Promise<{ error?: string }>;
}

export function HoursEditor({ initialRows, onSave }: HoursEditorProps) {
  const [rows, setRows] = useState<HourRowInput[]>(() =>
    DAY_LABELS.map((_, dayOfWeek) => toRow(initialRows.find((r) => r.day_of_week === dayOfWeek), dayOfWeek)),
  );
  const [error, setError] = useState<string | undefined>();
  const [savedAt, setSavedAt] = useState<number | undefined>();
  const [isPending, startTransition] = useTransition();

  function updateRow(index: number, patch: Partial<HourRowInput>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSave() {
    setError(undefined);
    setSavedAt(undefined);
    startTransition(async () => {
      const result = await onSave(rows);
      if (result.error) {
        setError(result.error);
      } else {
        setSavedAt(Date.now());
      }
    });
  }

  return (
    <div>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Day</th>
            <th className="py-2 pr-4 font-medium">Hours</th>
            <th className="py-2 font-medium">Opens</th>
            <th className="py-2 font-medium">Closes</th>
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((label, index) => {
            const row = rows[index];
            return (
              <tr key={label} className="border-t border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-900">{label}</td>
                <td className="py-2 pr-4">
                  <select
                    value={row.mode}
                    onChange={(e) => updateRow(index, { mode: e.target.value as HoursMode })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="closed">Closed</option>
                    <option value="24h">24 hours</option>
                    <option value="custom">Custom hours</option>
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="time"
                    disabled={row.mode !== "custom"}
                    value={row.opens_at}
                    onChange={(e) => updateRow(index, { opens_at: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="time"
                    disabled={row.mode !== "custom"}
                    value={row.closes_at}
                    onChange={(e) => updateRow(index, { closes_at: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-2 text-xs text-slate-400">
        Opening later than closing means the window crosses midnight (e.g. 22:00 → 04:00) — that&apos;s expected for
        late-night services, not a mistake.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {savedAt && !error && <p className="mt-3 text-sm text-green-700">Saved.</p>}

      <Button className="mt-4" onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save hours"}
      </Button>
    </div>
  );
}
