import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function StationsPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const { data: stations, error } = await supabase
    .from("stations")
    .select("id, name_en, address_en, is_active")
    .is("deleted_at", null)
    .order("name_en");

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

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {stations?.map((station) => (
              <tr key={station.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{station.name_en}</td>
                <td className="px-4 py-3 text-slate-600">{station.address_en}</td>
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
            {stations?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  No stations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
