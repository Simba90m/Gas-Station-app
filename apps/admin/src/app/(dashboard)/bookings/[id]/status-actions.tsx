"use client";

import { useState, useTransition } from "react";
import type { BookingStatus } from "@gas-station/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelBookingAction, updateBookingStatusAction } from "../actions";
import { nextStatusOptions } from "../status-transitions";

const STATUS_TONE: Record<BookingStatus, "green" | "gray" | "red" | "amber"> = {
  PENDING: "amber",
  CONFIRMED: "green",
  CHECKED_IN: "green",
  IN_PROGRESS: "amber",
  COMPLETED: "gray",
  CANCELLED: "red",
  NO_SHOW: "red",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Confirm",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Check in",
  IN_PROGRESS: "Start service",
  COMPLETED: "Mark completed",
  CANCELLED: "Cancel",
  NO_SHOW: "Mark no-show",
};

export function StatusActions({ bookingId, initialStatus }: { bookingId: string; initialStatus: BookingStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleTransition(next: BookingStatus) {
    if (next === "CANCELLED") {
      setShowCancelReason(true);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await updateBookingStatusAction(bookingId, next);
      if (result.error) setError(result.error);
      else setStatus(next);
    });
  }

  function handleCancel() {
    setError(undefined);
    startTransition(async () => {
      const result = await cancelBookingAction(bookingId, reason);
      if (result.error) {
        setError(result.error);
      } else {
        setStatus("CANCELLED");
        setShowCancelReason(false);
      }
    });
  }

  const nextOptions = nextStatusOptions(status);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={STATUS_TONE[status]}>{status.replace("_", " ")}</Badge>
        {nextOptions.map((next) => (
          <Button
            key={next}
            variant={next === "CANCELLED" || next === "NO_SHOW" ? "danger" : "secondary"}
            disabled={isPending}
            onClick={() => handleTransition(next)}
          >
            {STATUS_LABEL[next]}
          </Button>
        ))}
        {nextOptions.length === 0 && <span className="text-sm text-slate-400">No further status changes.</span>}
      </div>

      {showCancelReason && (
        <div className="mt-4 max-w-sm rounded-md border border-slate-200 bg-slate-50 p-4">
          <Label htmlFor="cancellation_reason">Cancellation reason (optional)</Label>
          <Input
            id="cancellation_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. customer requested"
          />
          <div className="mt-3 flex gap-2">
            <Button variant="danger" disabled={isPending} onClick={handleCancel}>
              {isPending ? "Cancelling..." : "Confirm cancellation"}
            </Button>
            <Button variant="ghost" disabled={isPending} onClick={() => setShowCancelReason(false)}>
              Never mind
            </Button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
