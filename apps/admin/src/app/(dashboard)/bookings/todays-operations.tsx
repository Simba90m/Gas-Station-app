"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  callNextAction,
  cancelQueueEntryAction,
  closeQueueAction,
  completeServiceAction,
  noShowQueueEntryAction,
  openQueueAction,
  startServiceAction,
} from "./queue-actions";

export interface QueueServiceRow {
  stationServiceId: string;
  stationId: string;
  stationName: string;
  serviceName: string;
  queueId: string | null;
  queueIsOpen: boolean;
}

export type QueueEntryStatus = "WAITING" | "CALLED" | "IN_SERVICE";

export interface QueueEntryRow {
  id: string;
  stationServiceId: string;
  customerName: string;
  position: number;
  status: QueueEntryStatus;
  joinedAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * "Today's Operations": the walk-in queue side of the /bookings screen —
 * open/close each station's per-service queue and work through who's
 * waiting. Sits above BookingsTable; nothing here duplicates booking
 * conflict logic — start/complete call the queue<->booking bridge RPCs
 * (see supabase/migrations/20240101000250_queue_booking_bridge.sql).
 */
export function TodaysOperations({ services, entries }: { services: QueueServiceRow[]; entries: QueueEntryRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const entriesByStationService = useMemo(() => {
    const map = new Map<string, QueueEntryRow[]>();
    for (const entry of entries) {
      const list = map.get(entry.stationServiceId) ?? [];
      list.push(entry);
      map.set(entry.stationServiceId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [entries]);

  const stationGroups = useMemo(() => {
    const map = new Map<string, { stationName: string; rows: QueueServiceRow[] }>();
    for (const row of services) {
      const group = map.get(row.stationId) ?? { stationName: row.stationName, rows: [] };
      group.rows.push(row);
      map.set(row.stationId, group);
    }
    return Array.from(map.values());
  }, [services]);

  function run(action: () => Promise<{ error?: string; bookingId?: string }>) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.bookingId) router.push(`/bookings/${result.bookingId}`);
    });
  }

  if (stationGroups.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-slate-900">Today&apos;s Operations — walk-in queue</h2>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 space-y-4">
        {stationGroups.map((group) => (
          <div key={group.stationName} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">{group.stationName}</p>
            <div className="mt-3 space-y-3">
              {group.rows.map((row) => {
                const rowEntries = entriesByStationService.get(row.stationServiceId) ?? [];
                return (
                  <div key={row.stationServiceId} className="rounded-md border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{row.serviceName}</span>
                      {row.queueIsOpen && row.queueId ? (
                        <Button
                          variant="ghost"
                          disabled={isPending}
                          onClick={() => run(() => closeQueueAction(row.queueId!))}
                        >
                          Close queue
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={isPending}
                          onClick={() => run(() => openQueueAction(row.stationId, row.stationServiceId))}
                        >
                          Open queue
                        </Button>
                      )}
                    </div>

                    {row.queueIsOpen && (
                      <ul className="mt-2 divide-y divide-slate-100">
                        {rowEntries.map((entry) => (
                          <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
                            <span className="text-slate-600">
                              #{entry.position} {entry.customerName} · joined {formatTime(entry.joinedAt)}
                            </span>
                            <span className="flex items-center gap-2">
                              <Badge tone={entry.status === "IN_SERVICE" ? "amber" : "gray"}>
                                {entry.status.replace("_", " ")}
                              </Badge>
                              {entry.status === "WAITING" && (
                                <Button variant="ghost" disabled={isPending} onClick={() => run(() => callNextAction(entry.id))}>
                                  Call
                                </Button>
                              )}
                              {(entry.status === "WAITING" || entry.status === "CALLED") && (
                                <>
                                  <Button
                                    variant="secondary"
                                    disabled={isPending}
                                    onClick={() => run(() => startServiceAction(entry.id, null))}
                                  >
                                    Start service
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    disabled={isPending}
                                    onClick={() => run(() => noShowQueueEntryAction(entry.id))}
                                  >
                                    No-show
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    disabled={isPending}
                                    onClick={() => run(() => cancelQueueEntryAction(entry.id))}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                              {entry.status === "IN_SERVICE" && (
                                <Button
                                  variant="secondary"
                                  disabled={isPending}
                                  onClick={() => run(() => completeServiceAction(entry.id))}
                                >
                                  Complete
                                </Button>
                              )}
                            </span>
                          </li>
                        ))}
                        {rowEntries.length === 0 && <li className="py-2 text-sm text-slate-400">No one waiting.</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
