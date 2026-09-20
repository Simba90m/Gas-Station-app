"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  bookSlotPublicAction,
  getAvailableSlotsPublicAction,
  joinAsNewCustomerAction,
  joinQueuePublicAction,
  type PublicServiceOption,
  type PublicStationOption,
} from "./actions";

type Mode = "queue" | "book";

function todayLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function JoinFlow({
  token,
  stations,
  services,
}: {
  token: string;
  stations: PublicStationOption[];
  services: PublicServiceOption[];
}) {
  const [stationId, setStationId] = useState("");
  const [service, setService] = useState<PublicServiceOption | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);

  const [date, setDate] = useState(todayLocalDate());
  const [slots, setSlots] = useState<{ start: string; end: string }[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [success, setSuccess] = useState<{ kind: Mode } | null>(null);
  const [isPending, startTransition] = useTransition();

  const servicesForStation = useMemo(() => services.filter((s) => s.stationId === stationId), [services, stationId]);
  const stationName = stations.find((s) => s.id === stationId)?.nameEn;

  function resetToStation() {
    setService(null);
    setMode(null);
    setSlots(null);
    setSelectedSlot(null);
    setSlotsError(undefined);
  }

  function handleFindSlots() {
    if (!service) return;
    setSlotsError(undefined);
    setSlots(null);
    setSelectedSlot(null);
    startTransition(async () => {
      const result = await getAvailableSlotsPublicAction(token, service.stationId, service.serviceId, date);
      if (result.error) setSlotsError(result.error);
      setSlots(result.slots);
    });
  }

  function handleSubmit() {
    if (!service || !mode) return;
    if (mode === "book" && !selectedSlot) {
      setSubmitError("Choose an available time first.");
      return;
    }
    setSubmitError(undefined);

    startTransition(async () => {
      const customerResult = await joinAsNewCustomerAction(token, { fullName, phone });
      if (customerResult.error) {
        setSubmitError(customerResult.error);
        return;
      }

      if (mode === "queue") {
        const result = await joinQueuePublicAction(token, { stationServiceId: service.stationServiceId });
        if (result.error) {
          setSubmitError(result.error);
          return;
        }
      } else if (selectedSlot) {
        const result = await bookSlotPublicAction(token, {
          stationId: service.stationId,
          serviceId: service.serviceId,
          startAt: selectedSlot.start,
        });
        if (result.error) {
          setSubmitError(result.error);
          return;
        }
      }

      setSuccess({ kind: mode });
    });
  }

  if (success) {
    return (
      <Card className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          {success.kind === "queue" ? "You're in the queue!" : "Booking confirmed!"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {success.kind === "queue"
            ? "Staff will call you when it's your turn. You can put your phone away."
            : "We'll see you at your scheduled time."}
        </p>
      </Card>
    );
  }

  // Step 1: station.
  if (!stationId) {
    return (
      <Card>
        <Label htmlFor="join_station">Choose your station</Label>
        <select
          id="join_station"
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">Select a station</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameEn}
            </option>
          ))}
        </select>
      </Card>
    );
  }

  // Step 2: service.
  if (!service) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-500">{stationName}</p>
          <Button variant="ghost" onClick={() => setStationId("")}>
            Change station
          </Button>
        </div>
        <Label>Choose a service</Label>
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
          {servicesForStation.map((s) => (
            <li key={s.stationServiceId}>
              <button
                type="button"
                onClick={() => setService(s)}
                className="flex w-full items-center justify-between px-3 py-3 text-left text-sm hover:bg-slate-50"
              >
                <span>{s.serviceName}</span>
                {s.queueIsOpen && <span className="text-xs font-medium text-green-700">Walk-in queue open</span>}
              </button>
            </li>
          ))}
          {servicesForStation.length === 0 && (
            <li className="px-3 py-3 text-sm text-slate-400">No services currently available at this station.</li>
          )}
        </ul>
      </Card>
    );
  }

  // Step 3: queue vs book.
  if (!mode) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {stationName} · {service.serviceName}
          </p>
          <Button variant="ghost" onClick={resetToStation}>
            Change
          </Button>
        </div>
        <div className="space-y-2">
          {service.queueIsOpen && (
            <Button className="w-full" onClick={() => setMode("queue")}>
              Join the walk-in queue
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setMode("book")}>
            Book a specific time
          </Button>
        </div>
      </Card>
    );
  }

  // Step 4 (book mode only): pick a slot before the customer form.
  if (mode === "book" && !selectedSlot) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {stationName} · {service.serviceName}
          </p>
          <Button variant="ghost" onClick={() => setMode(null)}>
            Back
          </Button>
        </div>
        <Label htmlFor="join_date">Date</Label>
        <div className="flex gap-2">
          <Input
            id="join_date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlots(null);
              setSelectedSlot(null);
            }}
            className="max-w-xs"
          />
          <Button variant="secondary" disabled={isPending} onClick={handleFindSlots}>
            {isPending ? "Loading..." : "Find times"}
          </Button>
        </div>

        {slotsError && <p className="mt-3 text-sm text-red-700">{slotsError}</p>}

        {slots && (
          <div className="mt-4">
            {slots.length === 0 ? (
              <p className="text-sm text-slate-500">No available times that day — try another date.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {new Date(slot.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }

  // Final step: the customer form.
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {stationName} · {service.serviceName}
          {mode === "book" && selectedSlot && ` · ${new Date(selectedSlot.start).toLocaleString()}`}
        </p>
        <Button variant="ghost" onClick={() => (mode === "book" ? setSelectedSlot(null) : setMode(null))}>
          Back
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="join_name">Full name</Label>
          <Input id="join_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="join_phone">Phone</Label>
          <Input
            id="join_phone"
            placeholder="+201012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {submitError && <p className="text-sm text-red-700">{submitError}</p>}
        <Button className="w-full" disabled={isPending || !fullName || !phone} onClick={handleSubmit}>
          {isPending ? "Please wait..." : mode === "queue" ? "Join the queue" : "Confirm booking"}
        </Button>
      </div>
    </Card>
  );
}
