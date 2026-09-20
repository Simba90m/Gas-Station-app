"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface EmployeeRow {
  id: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  stationNames: string[];
  serviceNames: string[];
}

export interface StationOption {
  id: string;
  nameEn: string;
}

/** Client-side search/filter is enough here — the roster is fetched once, server-side, and is a handful to a few dozen rows, not a paginated dataset. */
export function EmployeesTable({ employees, stations }: { employees: EmployeeRow[]; stations: StationOption[] }) {
  const [query, setQuery] = useState("");
  const [stationFilter, setStationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (q && !employee.fullName.toLowerCase().includes(q) && !(employee.phone ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (stationFilter && !employee.stationNames.includes(stationFilter)) return false;
      if (statusFilter === "active" && !employee.isActive) return false;
      if (statusFilter === "inactive" && employee.isActive) return false;
      return true;
    });
  }, [employees, query, stationFilter, statusFilter]);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="max-w-xs flex-1">
          <Input
            type="search"
            placeholder="Search by name or phone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search employees"
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Filter by status"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="all">Active + inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Stations</th>
              <th className="px-4 py-3 font-medium">Services</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((employee) => (
              <tr key={employee.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{employee.fullName}</td>
                <td className="px-4 py-3 text-slate-600">{employee.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {employee.stationNames.length > 0 ? employee.stationNames.join(", ") : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {employee.serviceNames.length > 0 ? employee.serviceNames.join(", ") : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={employee.isActive ? "green" : "gray"}>{employee.isActive ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/employees/${employee.id}`} className="text-sm font-medium text-slate-700 hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  {employees.length === 0 ? "No employees yet." : "No employees match your search/filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
