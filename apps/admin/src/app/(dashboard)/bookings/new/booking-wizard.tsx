"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomerAction,
  createManualBookingAction,
  getAvailableSlotsAction,
  searchCustomersAction,
  type AvailableSlot,
  type CustomerSearchResult,
} from "../actions";

export interface StationOption {
  id: string;
  nameEn: string;
}

export interface BookableService {
  stationServiceId: string;
  stationId: string;
  serviceId: string;
  serviceName: string;
}

export interface EmployeeOption {
  id: string;
  fullName: string;
}

function todayLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function BookingWizard({
  stations,
  services,
  employees,
}: {
  stations: StationOption[];
  services: BookableService[];
  employees: EmployeeOption[];
}) {
  const router = useRouter();

  // Step 1: customer. selectedCustomer is the SINGLE source of truth for
  // who this booking is for — the "Selected" summary, the Review section,
  // and handleConfirm's payload all read this same value, never a separate
  // display-only copy. It's only ever set to a real object, and only ever
  // from a response that already carries a real, server-issued UUID
  // (a search result row, or createCustomerAction's returned customer) —
  // never optimistically before that id exists.
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([]);
  const [customerSearchError, setCustomerSearchError] = useState<string | undefined>();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [createCustomerError, setCreateCustomerError] = useState<string | undefined>();

  // Steps 2-4: station / service / date.
  const [stationId, setStationId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayLocalDate());

  // Step 5: slots.
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [notes, setNotes] = useState("");

  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const servicesForStation = useMemo(() => services.filter((s) => s.stationId === stationId), [services, stationId]);
  const employeeNameById = useMemo(() => new Map(employees.map((e) => [e.id, e.fullName])), [employees]);

  function handleSearchCustomer() {
    setCustomerSearchError(undefined);
    startTransition(async () => {
      const result = await searchCustomersAction(customerQuery);
      if (result.error) setCustomerSearchError(result.error);
      setCustomerResults(result.results);
    });
  }

  function handleCreateCustomer() {
    setCreateCustomerError(undefined);
    startTransition(async () => {
      const result = await createCustomerAction({ fullName: newCustomerName, phone: newCustomerPhone });
      if (result.error || !result.customer) {
        setCreateCustomerError(result.error ?? "Couldn't create the customer.");
        return;
      }
      // Select immediately from the response's real id — never before this
      // point, so there's no window where a name is shown without a real,
      // usable customer UUID behind it.
      setSelectedCustomer(result.customer);
      setShowCreateCustomer(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
    });
  }

  function handleFindSlots() {
    setSlotsError(undefined);
    setSlots(null);
    setSelectedSlot(null);
    setEmployeeId("");
    startTransition(async () => {
      const result = await getAvailableSlotsAction(stationId, serviceId, date);
      if (result.error) setSlotsError(result.error);
      setSlots(result.slots);
    });
  }

  function handleConfirm() {
    // Belt-and-suspenders: the Confirm button is already disabled unless
    // canConfirm is true, but this makes any future regression visible
    // (a clear message) instead of a silent no-op.
    if (!selectedCustomer) {
      setSubmitError("Choose or create a customer first.");
      return;
    }
    if (!selectedSlot) {
      setSubmitError("Choose an available time first.");
      return;
    }
    setSubmitError(undefined);
    const payload = {
      customerId: selectedCustomer.id,
      stationId,
      serviceId,
      startAt: selectedSlot.start,
      employeeId: employeeId || null,
      notes: notes || null,
    };
    startTransition(async () => {
      const result = await createManualBookingAction(payload);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      if (result.bookingId) router.push(`/bookings/${result.bookingId}`);
    });
  }

  const canFindSlots = Boolean(stationId && serviceId && date);
  const canConfirm = Boolean(selectedCustomer && selectedSlot);

  return (
    <div className="space-y-6">
      <div>
        <Label>1. Customer</Label>
        {selectedCustomer ? (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span>
              {selectedCustomer.fullName} {selectedCustomer.phone ? `(${selectedCustomer.phone})` : ""}
            </span>
            <Button variant="ghost" onClick={() => setSelectedCustomer(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex gap-2">
              <Input
                placeholder="Search by name or phone"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchCustomer()}
              />
              <Button variant="secondary" onClick={handleSearchCustomer} disabled={isPending}>
                Search
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateCustomer((v) => !v);
                  setCreateCustomerError(undefined);
                }}
                disabled={isPending}
              >
                Create customer
              </Button>
            </div>
            {customerSearchError && <p className="mt-2 text-sm text-red-700">{customerSearchError}</p>}
            {customerResults.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                {customerResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerResults([]);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {c.fullName} {c.phone ? `(${c.phone})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {showCreateCustomer && (
              <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">For a walk-in with no existing account yet.</p>
                <div>
                  <Label htmlFor="new_customer_name">Full name</Label>
                  <Input
                    id="new_customer_name"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="new_customer_phone">Phone</Label>
                  <Input
                    id="new_customer_phone"
                    placeholder="+201012345678"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                  />
                </div>
                {createCustomerError && <p className="text-sm text-red-700">{createCustomerError}</p>}
                <div className="flex gap-2">
                  <Button onClick={handleCreateCustomer} disabled={isPending}>
                    {isPending ? "Creating..." : "Create and select"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowCreateCustomer(false)} disabled={isPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="station">2. Station</Label>
          <select
            id="station"
            value={stationId}
            required
            onChange={(e) => {
              setStationId(e.target.value);
              setServiceId("");
              setSlots(null);
              setSelectedSlot(null);
              setEmployeeId("");
            }}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">Choose a station</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameEn}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="service">3. Service</Label>
          <select
            id="service"
            value={serviceId}
            required
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlots(null);
              setSelectedSlot(null);
              setEmployeeId("");
            }}
            disabled={!stationId}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100"
          >
            <option value="">Choose a service</option>
            {servicesForStation.map((s) => (
              <option key={s.stationServiceId} value={s.serviceId}>
                {s.serviceName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="date">4. Date</Label>
        <div className="flex gap-2">
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlots(null);
              setSelectedSlot(null);
              setEmployeeId("");
            }}
            className="max-w-xs"
          />
          <Button variant="secondary" disabled={!canFindSlots || isPending} onClick={handleFindSlots}>
            {isPending ? "Loading..." : "Find available times"}
          </Button>
        </div>
      </div>

      {slotsError && <p className="text-sm text-red-700">{slotsError}</p>}

      {slots && (
        <div>
          <Label>5. Available time</Label>
          {slots.length === 0 ? (
            <p className="text-sm text-slate-500">No genuinely available slots for this station/service/date.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setEmployeeId("");
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    selectedSlot?.start === slot.start
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {new Date(slot.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedSlot && selectedSlot.employeeIds.length > 0 && (
        <div>
          <Label htmlFor="employee">6. Employee preference (optional)</Label>
          <select
            id="employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="block w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">No preference</option>
            {selectedSlot.employeeIds.map((id) => (
              <option key={id} value={id}>
                {employeeNameById.get(id) ?? "Employee"}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedSlot && (
        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
      )}

      {selectedSlot && selectedCustomer && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-900">Review</p>
          <p className="mt-1 text-slate-600">
            {selectedCustomer.fullName} · {stations.find((s) => s.id === stationId)?.nameEn} ·{" "}
            {servicesForStation.find((s) => s.serviceId === serviceId)?.serviceName} ·{" "}
            {new Date(selectedSlot.start).toLocaleString()}
          </p>
        </div>
      )}

      {submitError && <p className="text-sm text-red-700">{submitError}</p>}

      <Button disabled={!canConfirm || isPending} onClick={handleConfirm}>
        {isPending ? "Booking..." : "Confirm booking"}
      </Button>
    </div>
  );
}
