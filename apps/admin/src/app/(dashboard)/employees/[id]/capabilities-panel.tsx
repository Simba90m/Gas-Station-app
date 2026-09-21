"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addCapabilityAction, removeCapabilityAction, type EmployeeActionState } from "../actions";

export interface CapabilityRow {
  capabilityId: string;
  serviceId: string;
  serviceName: string;
}

export interface ServiceOption {
  id: string;
  nameEn: string;
}

const INITIAL_STATE: EmployeeActionState = {};

function RemoveButton({ employeeId, capabilityId }: { employeeId: string; capabilityId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    setError(undefined);
    startTransition(async () => {
      const result = await removeCapabilityAction(employeeId, capabilityId);
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

export function CapabilitiesPanel({
  employeeId,
  capabilities,
  available,
}: {
  employeeId: string;
  capabilities: CapabilityRow[];
  available: ServiceOption[];
}) {
  const [state, formAction, isPending] = useActionState(addCapabilityAction, INITIAL_STATE);

  // Controlled <select>, same reasoning as StationAssignmentsPanel: value
  // lives in this state (updated by onChange), and it's reset back to the
  // placeholder only once a submission that was actually pending finishes
  // with no error.
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      setSelectedServiceId("");
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  // Submission builds FormData explicitly from selectedServiceId/employeeId
  // — known-good React state — and hands it directly to formAction, instead
  // of relying on the browser reading the <select>'s DOM value via a native
  // <form action={formAction}> submission. See StationAssignmentsPanel for
  // the full reasoning — this is the same fix, same bug class. Wrapped in
  // startTransition since formAction is being called directly rather than
  // via <form action={formAction}> — without it, isPending never updates.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServiceId) return;
    const formData = new FormData();
    formData.set("employee_id", employeeId);
    formData.set("service_id", selectedServiceId);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.capabilityId} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{capability.serviceName}</td>
                <td className="px-4 py-3 text-right">
                  <RemoveButton employeeId={employeeId} capabilityId={capability.capabilityId} />
                </td>
              </tr>
            ))}
            {capabilities.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                  No service capabilities recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {available.length > 0 ? (
        <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-3">
          <input type="hidden" name="employee_id" value={employeeId} />
          <div className="flex-1 max-w-xs">
            <Label htmlFor="service_id">Add a service capability</Label>
            <select
              id="service_id"
              name="service_id"
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
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
            {isPending ? "Adding..." : "+ Add service capability"}
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          {capabilities.length === 0
            ? "No active services exist yet to add as a capability. Create one from a station's Services panel first."
            : "This employee already has every active service as a capability. Create a new service from a station's Services panel to add more."}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </div>
  );
}
