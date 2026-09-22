import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RecentActivityItem } from "@/app/(dashboard)/get-dashboard-metrics";
import type { BookingStatus } from "@gas-station/types";

// Same tone mapping as bookings/bookings-table.tsx — kept as its own small
// copy here rather than exported from that (unrelated, untouched) module.
const STATUS_TONE: Record<BookingStatus, "green" | "gray" | "red" | "amber"> = {
  PENDING: "gray",
  CONFIRMED: "amber",
  CHECKED_IN: "amber",
  IN_PROGRESS: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
  NO_SHOW: "red",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The booking_status_history audit trail (already recorded by the DB for every status change), shown as a plain activity feed — no new schema. */
export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No booking activity yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <Link href={`/bookings/${item.bookingId}`} className="flex items-center justify-between gap-3 hover:underline">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {item.customerName} — {item.serviceName}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {item.stationName} · {formatWhen(item.changedAt)}
                  </span>
                </span>
                <Badge tone={STATUS_TONE[item.status]} className="shrink-0">
                  {item.status.replace("_", " ")}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
