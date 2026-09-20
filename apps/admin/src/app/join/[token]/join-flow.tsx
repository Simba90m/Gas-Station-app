"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  bookSlotAction,
  getAvailableSlotsPublicAction,
  getQueueStatusAction,
  identifyPhoneAction,
  startWalkInAction,
  type PublicServiceOption,
  type PublicStationOption,
  type QueueTicket,
} from "./actions";

type Mode = "walk-in" | "book";

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

  // Phone-first identification: the same phone field drives both "this
  // number already has an account, just continue" and "brand new — also
  // collect a name" — never a forced "Create Account" step for a returning
  // customer.
  const [phone, setPhone] = useState<string | null>(null);
  const [identifyError, setIdentifyError] = useState<string | undefined>();
  const [identified, setIdentified] = useState<{ exists: boolean; phone: string } | null>(null);
  const [fullName, setFullName] = useState("");

  const [submitError, setSubmitError] = useState<string | undefined>();
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const servicesForStation = useMemo(() => services.filter((s) => s.stationId === stationId), [services, stationId]);
  const stationName = stations.find((s) => s.id === stationId)?.nameEn;

  function resetToStation() {
    setService(null);
    setMode(null);
    resetIdentity();
  }

  function resetIdentity() {
    setSlots(null);
    setSelectedSlot(null);
    setSlotsError(undefined);
    setPhone(null);
    setIdentifyError(undefined);
    setIdentified(null);
    setFullName("");
    setSubmitError(undefined);
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

  function handleIdentify() {
    if (!phone) {
      setIdentifyError("Enter a valid phone number.");
      return;
    }
    setIdentifyError(undefined);
    setIdentified(null);
    startTransition(async () => {
      const result = await identifyPhoneAction(token, phone);
      if (result.error || result.exists === undefined) {
        setIdentifyError(result.error ?? "Couldn't check that number — please try again.");
        return;
      }
      setIdentified({ exists: result.exists, phone: result.normalizedPhone ?? phone });
    });
  }

  function handleConfirmIdentity() {
    if (!identified || !service || !mode) return;
    if (!identified.exists && !fullName.trim()) {
      setSubmitError("Enter your name to create an account.");
      return;
    }
    setSubmitError(undefined);

    startTransition(async () => {
      if (mode === "walk-in") {
        const result = await startWalkInAction(token, {
          phone: identified.phone,
          fullName: identified.exists ? null : fullName.trim(),
          stationServiceId: service.stationServiceId,
        });
        if (result.error || !result.ticket) {
          setSubmitError(result.error ?? "Couldn't join the queue.");
          return;
        }
        setTicket(result.ticket);
      } else if (selectedSlot) {
        const result = await bookSlotAction(token, {
          phone: identified.phone,
          fullName: identified.exists ? null : fullName.trim(),
          stationId: service.stationId,
          serviceId: service.serviceId,
          startAt: selectedSlot.start,
        });
        if (result.error) {
          setSubmitError(result.error);
          return;
        }
        setBookingConfirmed(true);
      }
    });
  }

  function handleRefreshTicket() {
    if (!ticket) return;
    startTransition(async () => {
      const result = await getQueueStatusAction(token, ticket.queueEntryId);
      if (result.ticket) setTicket(result.ticket);
    });
  }

  // Final step: the ticket (walk-in) or confirmation (booking).
  if (ticket) {
    return (
      <Card className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">You&apos;re in the queue!</h2>
        <p className="mt-1 text-sm text-slate-500">Staff will call you when it&apos;s your turn.</p>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-3xl font-bold text-slate-900">#{ticket.position}</p>
          <p className="mt-1 text-sm text-slate-600">Your ticket number</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Ahead of you</dt>
            <dd className="text-right font-medium text-slate-900">{ticket.rank}</dd>
            <dt className="text-slate-500">Estimated wait</dt>
            <dd className="text-right font-medium text-slate-900">~{ticket.estimatedWaitMinutes} min</dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="text-right font-medium text-slate-900">{ticket.status.replace("_", " ")}</dd>
          </dl>
        </div>
        <Button variant="secondary" className="mt-4" onClick={handleRefreshTicket} disabled={isPending}>
          {isPending ? "Refreshing..." : "Refresh status"}
        </Button>
      </Card>
    );
  }

  if (bookingConfirmed) {
    return (
      <Card className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">Booking confirmed!</h2>
        <p className="mt-2 text-sm text-slate-600">We&apos;ll see you at your scheduled time.</p>
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

  // Step 3: what do you need? — walk-in now, or a specific future time.
  // Never shows booking slots as part of "I'm here now".
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
        <Label>What do you need?</Label>
        <div className="mt-2 space-y-2">
          {service.queueIsOpen && (
            <Button className="w-full" onClick={() => setMode("walk-in")}>
              Start now (join the walk-in queue)
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setMode("book")}>
            Book for later
          </Button>
        </div>
      </Card>
    );
  }

  // Step 4 (book mode only): pick a slot before identification — slots are
  // never shown for the walk-in path.
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

  // Final step: phone-first identification, then (only if genuinely new) a
  // name field — an existing customer never sees "Create Account".
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {stationName} · {service.serviceName}
          {mode === "book" && selectedSlot && ` · ${new Date(selectedSlot.start).toLocaleString()}`}
        </p>
        <Button
          variant="ghost"
          onClick={() => (mode === "book" ? setSelectedSlot(null) : setMode(null))}
        >
          Back
        </Button>
      </div>

      <div className="space-y-3">
        <PhoneInput
          id="join_phone"
          label="Your phone number"
          value={phone}
          onChange={(e164) => {
            setPhone(e164);
            setIdentified(null);
            setIdentifyError(undefined);
          }}
        />

        {!identified && (
          <Button disabled={isPending || !phone} onClick={handleIdentify}>
            {isPending ? "Checking..." : "Continue"}
          </Button>
        )}
        {identifyError && <p className="text-sm text-red-700">{identifyError}</p>}

        {identified?.exists && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Welcome back! We found your account.
          </div>
        )}

        {identified && !identified.exists && (
          <div>
            <Label htmlFor="join_name">Full name</Label>
            <Input id="join_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
        )}

        {identified && (
          <>
            {submitError && <p className="text-sm text-red-700">{submitError}</p>}
            <Button
              className="w-full"
              disabled={isPending || (!identified.exists && !fullName.trim())}
              onClick={handleConfirmIdentity}
            >
              {isPending
                ? "Please wait..."
                : identified.exists
                  ? "Confirm — it's me"
                  : mode === "walk-in"
                    ? "Create account & join the queue"
                    : "Create account & confirm booking"}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
