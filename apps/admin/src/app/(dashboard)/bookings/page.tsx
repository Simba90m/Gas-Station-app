import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { parseTimeRange } from "@/lib/postgres-range";
import { BookingsTable, type BookingRow, type StationOption } from "./bookings-table";

export default async function BookingsPage() {
  const supabase = await createClient();

  const [
    { data: bookings, error: bookingsError },
    { data: stations },
    { data: stationServices },
    { data: services },
    { data: profiles },
    { data: resources },
  ] = await Promise.all([
    // RLS (bookings_select) already scopes this to what the signed-in
    // staff member can see — their own station(s), or every station for
    // OWNER/MANAGER. Fetches a generous recent+upcoming window; the table
    // below does date/station/status filtering client-side, same pattern
    // as the stations/employees tables.
    supabase
      .from("bookings")
      .select("id, station_id, station_service_id, customer_id, employee_id, resource_id, time_range, status, price")
      .order("time_range", { ascending: false })
      .limit(300),
    supabase.from("stations").select("id, name_en"),
    supabase.from("station_services").select("id, service_id"),
    supabase.from("services").select("id, name_en"),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("service_resources").select("id, name_en"),
  ]);

  const stationNameById = new Map((stations ?? []).map((s) => [s.id, s.name_en]));
  const serviceIdByStationService = new Map((stationServices ?? []).map((ss) => [ss.id, ss.service_id]));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const resourceNameById = new Map((resources ?? []).map((r) => [r.id, r.name_en]));

  const bookingRows: BookingRow[] = (bookings ?? []).flatMap((b) => {
    const range = parseTimeRange(b.time_range);
    if (!range) return [];
    const serviceId = serviceIdByStationService.get(b.station_service_id);

    return [
      {
        id: b.id,
        stationName: stationNameById.get(b.station_id) ?? "Unknown station",
        serviceName: (serviceId && serviceNameById.get(serviceId)) ?? "Unknown service",
        customerName: profileNameById.get(b.customer_id) ?? "Unknown customer",
        employeeName: b.employee_id ? (profileNameById.get(b.employee_id) ?? "Unknown") : null,
        resourceName: b.resource_id ? (resourceNameById.get(b.resource_id) ?? "Unknown") : null,
        startAt: range.start,
        endAt: range.end,
        status: b.status,
        price: b.price,
      },
    ];
  });

  const stationOptions: StationOption[] = (stations ?? []).map((s) => ({ id: s.id, nameEn: s.name_en }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Bookings</h1>
          <p className="mt-1 text-sm text-slate-500">Defaults to today — filter by date, station, or status below.</p>
        </div>
        <Link href="/bookings/new">
          <Button>New booking</Button>
        </Link>
      </div>

      {bookingsError && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load bookings: {bookingsError.message}
        </p>
      )}

      <BookingsTable bookings={bookingRows} stations={stationOptions} />
    </div>
  );
}
