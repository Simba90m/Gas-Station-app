"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface StationRow {
  id: string;
  name_en: string;
  address_en: string;
  phone: string | null;
  is_active: boolean;
  /** null = this viewer's role can't see enough of employee_station_assignments/employees to know — shown as "—", not a false "0". */
  employeeCount: number | null;
}

/** Client-side search is enough here: every station is already fetched server-side, and this is a handful to a few dozen rows, not a paginated dataset. */
export function StationsTable({ stations }: { stations: StationRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (station) => station.name_en.toLowerCase().includes(q) || station.address_en.toLowerCase().includes(q),
    );
  }, [stations, query]);

  return (
    <div>
      {stations.length > 1 && (
        <div className="mt-4 max-w-xs">
          <Input
            type="search"
            placeholder="Search by name or address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search stations"
          />
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((station) => (
              <tr key={station.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{station.name_en}</td>
                <td className="px-4 py-3 text-slate-600">{station.address_en}</td>
                <td className="px-4 py-3 text-slate-600">{station.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {station.employeeCount === null ? "—" : station.employeeCount}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={station.is_active ? "green" : "gray"}>
                    {station.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/stations/${station.id}`} className="text-sm font-medium text-slate-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  {stations.length === 0 ? "No stations yet." : "No stations match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
