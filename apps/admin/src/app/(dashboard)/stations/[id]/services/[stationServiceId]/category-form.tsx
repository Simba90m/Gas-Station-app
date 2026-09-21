"use client";

import { useActionState } from "react";
import type { ServiceCategory } from "@gas-station/types";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateServiceCategoryAction, type ServiceActionState } from "../actions";

const INITIAL_STATE: ServiceActionState = {};

// Same owner-facing labels as the "create a new service" form — see
// services-panel.tsx.
const CATEGORY_OPTIONS: { value: ServiceCategory; label: string }[] = [
  { value: "BOOKABLE", label: "Bookable service (customers can book or queue for this)" },
  { value: "INFO", label: "Station info (not bookable, e.g. Fuel)" },
  { value: "CONTENT", label: "Café & content (menu item, promotion — not bookable)" },
];

export function CategoryForm({
  stationId,
  stationServiceId,
  serviceId,
  category,
}: {
  stationId: string;
  stationServiceId: string;
  serviceId: string;
  category: ServiceCategory;
}) {
  const [state, formAction, isPending] = useActionState(updateServiceCategoryAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex items-end gap-3">
      <input type="hidden" name="station_id" value={stationId} />
      <input type="hidden" name="station_service_id" value={stationServiceId} />
      <input type="hidden" name="service_id" value={serviceId} />
      <div className="max-w-xs flex-1">
        <Label htmlFor="category">Service type</Label>
        <select
          id="category"
          name="category"
          defaultValue={category}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Saving..." : "Save type"}
      </Button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
