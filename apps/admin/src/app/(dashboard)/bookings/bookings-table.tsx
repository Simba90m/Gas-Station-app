"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BookingStatus } from "@gas-station/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface BookingRow {
  id: string;
  stationName: string;
  serviceName: string;
  customerName: string;
  employeeName: string | null;
  resourceName: string | null;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  price: number;
}

export interface StationOption {
  id: string;
  nameEn: string;
}

const STATUS_TONE: Record<BookingStatus, "green" | "gray" | "red" | "amber"> = {
  PENDING: "amber",
  CONFIRMED: "green",
  CHECKED_IN: "green",
  IN_PROGRESS: "amber",
  COMPLETED: "gray",
  CANCELLED: "red",
  NO_SHOW: "red",
};

function todayLocalDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Client-side filter is enough here — a fetched window of a few hundred
 * recent/upcoming bookings, not a paginated dataset (same reasoning as the
 * stations/employees tables). */
export function BookingsTable({ bookings, stations }: { bookings: BookingRow[]; stations: StationOption[] }) {
  const [date, setDate] = useState(todayLocalDate());
  const [showAllDates, setShowAllDates] = useState(false);
  const [stationFilter, setStationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (!showAllDates && b.startAt.slice(0, 10) !== date) return false;
      if (stationFilter && b.stationName !== stationFilter) return false;
      if (statusFilter && b.status !== statusFilter) return false;
      return true;
    });
  }, [bookings, date, showAllDates, stationFilter, statusFilter]);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={showAllDates}
            aria-label="Filter by date"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAllDates} onChange={(e) => setShowAllDates(e.target.checked)} />
          Show all dates
        </label>
        <select
          value={stationFilter}
          onChange={(e) => setStationFilter(e.target.value)}
          aria-label="Filter by station"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All stations</option>
          {stations.map((station) => (
            <option key={station.id} value={station.nameEn}>
              {station.nameEn}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_TONE).map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-600">
                  {formatTime(b.startAt)}–{formatTime(b.endAt)}
                </td>
                <td className="px-4 py-3 text-slate-600">{b.stationName}</td>
                <td className="px-4 py-3 text-slate-600">{b.serviceName}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{b.customerName}</td>
                <td className="px-4 py-3 text-slate-600">{b.employeeName ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[b.status]}>{b.status.replace("_", " ")}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/bookings/${b.id}`} className="text-sm font-medium text-slate-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  {bookings.length === 0 ? "No bookings yet." : "No bookings match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
