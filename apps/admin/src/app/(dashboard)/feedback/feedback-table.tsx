"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { IssueCategory } from "@gas-station/types";
import { Input } from "@/components/ui/input";
import { RatingStars } from "./rating-stars";
import { ISSUE_CATEGORY_LABELS } from "./constants";

export interface FeedbackRow {
  id: string;
  customerName: string;
  stationName: string;
  serviceName: string;
  employeeName: string | null;
  rating: number;
  category: IssueCategory;
  comment: string | null;
  createdAt: string;
}

export interface StationOption {
  id: string;
  nameEn: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Client-side search/filter is enough here — same reasoning as
 * employees-table.tsx/bookings-table.tsx: a fetched window of feedback
 * rows, not a paginated dataset. */
export function FeedbackTable({ feedback, stations }: { feedback: FeedbackRow[]; stations: StationOption[] }) {
  const [query, setQuery] = useState("");
  const [stationFilter, setStationFilter] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"" | IssueCategory>("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return feedback.filter((f) => {
      if (
        q &&
        !f.customerName.toLowerCase().includes(q) &&
        !(f.comment ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (stationFilter && f.stationName !== stationFilter) return false;
      if (ratingFilter && f.rating !== Number(ratingFilter)) return false;
      if (categoryFilter && f.category !== categoryFilter) return false;
      return true;
    });
  }, [feedback, query, stationFilter, ratingFilter, categoryFilter]);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="max-w-xs flex-1">
          <Input
            type="search"
            placeholder="Search by customer or comment..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search feedback"
          />
        </div>
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
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          aria-label="Filter by rating"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} star{r === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          aria-label="Filter by category"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">All categories</option>
          {(Object.keys(ISSUE_CATEGORY_LABELS) as IssueCategory[]).map((category) => (
            <option key={category} value={category}>
              {ISSUE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Station</th>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Comment</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(f.createdAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{f.customerName}</td>
                <td className="px-4 py-3 text-slate-600">{f.stationName}</td>
                <td className="px-4 py-3 text-slate-600">{f.serviceName}</td>
                <td className="px-4 py-3">
                  <RatingStars rating={f.rating} />
                </td>
                <td className="px-4 py-3 text-slate-600">{f.comment ? truncate(f.comment, 60) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/feedback/${f.id}`} className="text-sm font-medium text-slate-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  {feedback.length === 0 ? "No feedback yet." : "No feedback matches your search/filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
