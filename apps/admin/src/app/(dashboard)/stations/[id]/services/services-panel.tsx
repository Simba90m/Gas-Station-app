"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServiceAction, enableServiceAction, setStationServiceActiveAction, type ServiceActionState } from "./actions";

export interface EnabledServiceRow {
  stationServiceId: string;
  nameEn: string;
  basePrice: number;
  priceOverride: number | null;
  durationMinutes: number;
  isActive: boolean;
}

export interface AvailableService {
  id: string;
  nameEn: string;
}

const INITIAL_STATE: ServiceActionState = {};

function DisableToggle({
  stationId,
  stationServiceId,
  isActive,
}: {
  stationId: string;
  stationServiceId: string;
  isActive: boolean;
}) {
  const [active, setActive] = useState(isActive);
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(undefined);
    const next = !active;
    startTransition(async () => {
      const result = await setStationServiceActiveAction(stationId, stationServiceId, next);
      if (result.error) {
        setError(result.error);
      } else {
        setActive(next);
      }
    });
  }

  return (
    <div>
      <Button variant={active ? "danger" : "primary"} onClick={handleToggle} disabled={isPending}>
        {isPending ? "Saving..." : active ? "Disable" : "Enable"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

const TEXTAREA_CLASSES =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

function CreateServiceForm({ stationId }: { stationId: string }) {
  const [state, formAction, isPending] = useActionState(createServiceAction, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-4 space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="station_id" value={stationId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="new_name_en">Name (English)</Label>
          <Input id="new_name_en" name="name_en" required />
        </div>
        <div>
          <Label htmlFor="new_name_ar">Name (Arabic)</Label>
          <Input id="new_name_ar" name="name_ar" dir="rtl" required />
        </div>
        <div>
          <Label htmlFor="new_base_price">Catalog price (EGP)</Label>
          <Input id="new_base_price" name="base_price" type="number" step="0.01" min={0} required />
        </div>
        <div>
          <Label htmlFor="new_duration_minutes">Duration (minutes)</Label>
          <Input id="new_duration_minutes" name="duration_minutes" type="number" step="1" min={1} required />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="new_description_en">Description (English, optional)</Label>
          <textarea id="new_description_en" name="description_en" rows={2} className={TEXTAREA_CLASSES} />
        </div>
        <div>
          <Label htmlFor="new_description_ar">Description (Arabic, optional)</Label>
          <textarea id="new_description_ar" name="description_ar" dir="rtl" rows={2} className={TEXTAREA_CLASSES} />
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="requires_employee_selection" className="rounded border-slate-300" />
          Customer must pick an employee
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="requires_resource" className="rounded border-slate-300" />
          Needs a resource (e.g. a bay)
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="is_active" defaultChecked className="rounded border-slate-300" />
          Active immediately
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create & enable here"}
      </Button>
    </form>
  );
}

export function ServicesPanel({
  stationId,
  enabled,
  available,
}: {
  stationId: string;
  enabled: EnabledServiceRow[];
  available: AvailableService[];
}) {
  const [state, formAction, isPending] = useActionState(enableServiceAction, INITIAL_STATE);
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {enabled.map((service) => (
              <tr key={service.stationServiceId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{service.nameEn}</td>
                <td className="px-4 py-3 text-slate-600">
                  {service.priceOverride ?? service.basePrice} EGP
                  {service.priceOverride !== null && (
                    <span className="ml-1 text-xs text-slate-400">(catalog: {service.basePrice} EGP)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{service.durationMinutes} min</td>
                <td className="px-4 py-3">
                  <Badge tone={service.isActive ? "green" : "gray"}>{service.isActive ? "Enabled" : "Disabled"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/stations/${stationId}/services/${service.stationServiceId}`}
                      className="text-sm font-medium text-slate-700 hover:underline"
                    >
                      Manage
                    </Link>
                    <DisableToggle stationId={stationId} stationServiceId={service.stationServiceId} isActive={service.isActive} />
                  </div>
                </td>
              </tr>
            ))}
            {enabled.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  No services enabled at this station yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {available.length > 0 && (
        <form action={formAction} className="mt-4 flex items-end gap-3">
          <input type="hidden" name="station_id" value={stationId} />
          <div className="flex-1 max-w-xs">
            <Label htmlFor="service_id">Enable a catalog service</Label>
            <select
              id="service_id"
              name="service_id"
              defaultValue=""
              required
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="" disabled>
                Choose a service...
              </option>
              {available.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.nameEn}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding..." : "Enable"}
          </Button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div className="mt-4">
        <Button variant="secondary" onClick={() => setShowCreateForm((v) => !v)}>
          {showCreateForm ? "Cancel" : "+ Create a new service"}
        </Button>
        {showCreateForm && <CreateServiceForm stationId={stationId} />}
      </div>
    </div>
  );
}
