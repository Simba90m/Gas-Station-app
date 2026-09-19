"use client";

import { useActionState, useState, useTransition } from "react";
import type { ResourceStatus } from "@gas-station/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addResourceAction, setResourceStatusAction, type ServiceActionState } from "../actions";

export interface ResourceRow {
  id: string;
  nameEn: string;
  nameAr: string;
  status: ResourceStatus;
}

const STATUS_TONE: Record<ResourceStatus, "green" | "amber" | "gray"> = {
  AVAILABLE: "green",
  MAINTENANCE: "amber",
  INACTIVE: "gray",
};

const INITIAL_STATE: ServiceActionState = {};

function ResourceStatusSelect({
  stationId,
  stationServiceId,
  resource,
}: {
  stationId: string;
  stationServiceId: string;
  resource: ResourceRow;
}) {
  const [status, setStatus] = useState<ResourceStatus>(resource.status);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: ResourceStatus) {
    setError(undefined);
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await setResourceStatusAction(stationId, stationServiceId, resource.id, next);
      if (result.error) {
        setStatus(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
        <select
          value={status}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.value as ResourceStatus)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
        >
          <option value="AVAILABLE">Available</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function ResourcesPanel({
  stationId,
  stationServiceId,
  resources,
}: {
  stationId: string;
  stationServiceId: string;
  resources: ResourceRow[];
}) {
  const [state, formAction, isPending] = useActionState(addResourceAction, INITIAL_STATE);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name (English)</th>
              <th className="px-4 py-3 font-medium">Name (Arabic)</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => (
              <tr key={resource.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{resource.nameEn}</td>
                <td className="px-4 py-3 text-slate-600" dir="rtl">
                  {resource.nameAr}
                </td>
                <td className="px-4 py-3">
                  <ResourceStatusSelect stationId={stationId} stationServiceId={stationServiceId} resource={resource} />
                </td>
              </tr>
            ))}
            {resources.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">
                  No resources added yet — e.g. car wash bays.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={formAction} className="mt-4 flex items-end gap-3">
        <input type="hidden" name="station_id" value={stationId} />
        <input type="hidden" name="station_service_id" value={stationServiceId} />
        <div>
          <Label htmlFor="name_en">Name (English)</Label>
          <Input id="name_en" name="name_en" placeholder="Bay 1" required />
        </div>
        <div>
          <Label htmlFor="name_ar">Name (Arabic)</Label>
          <Input id="name_ar" name="name_ar" dir="rtl" placeholder="مسار 1" required />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding..." : "Add resource"}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
