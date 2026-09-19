import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StationsTable, type StationRow } from "./stations-table";

export default async function StationsPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data: stations, error } = await supabase
    .from("stations")
    .select("id, name_en, address_en, phone, is_active")
    .is("deleted_at", null)
    .order("name_en");

  // "Staff" count, per station — a lightweight operational signal on the
  // list, not a real analytics feature (that's later-phase territory). Two
  // flat queries + an in-memory join rather than an embedded select: this
  // hand-scoped Database type (packages/types/src/database.ts) doesn't
  // model foreign-key Relationships, so a typed embedded/join select isn't
  // reliable here the way it would be with a real generated types file.
  // Both queries are independently RLS-scoped, so a role with limited
  // visibility (e.g. a station manager, for stations other than their own)
  // naturally gets an incomplete rather than incorrect count — surfaced as
  // "—" below, never a misleading 0.
  const [{ data: assignments }, { data: activeEmployees }] = await Promise.all([
    supabase.from("employee_station_assignments").select("station_id, profile_id"),
    supabase.from("employees").select("id").eq("is_active", true).is("deleted_at", null),
  ]);

  const activeEmployeeIds = activeEmployees && new Set(activeEmployees.map((e) => e.id));
  const stationRows: StationRow[] = (stations ?? []).map((station) => ({
    ...station,
    employeeCount:
      assignments && activeEmployeeIds
        ? assignments.filter((a) => a.station_id === station.id && activeEmployeeIds.has(a.profile_id)).length
        : null,
  }));

  const canCreate = user?.role === "OWNER" || user?.role === "MANAGER";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Stations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canCreate
              ? "Manage every station."
              : "Stations you're assigned to can be edited; others are shown for reference."}
          </p>
        </div>
        {canCreate && (
          <Link href="/stations/new">
            <Button>New station</Button>
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load stations: {error.message}
        </p>
      )}

      <StationsTable stations={stationRows} />
    </div>
  );
}
