import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { BookingWizard, type BookableService, type EmployeeOption, type StationOption } from "./booking-wizard";

export default async function NewBookingPage() {
  const supabase = await createClient();

  const [{ data: stations }, { data: services }, { data: stationServices }, { data: employees }] = await Promise.all([
    supabase.from("stations").select("id, name_en").is("deleted_at", null).order("name_en"),
    // parent_service_id is used purely to find which services are package
    // GROUPS (referenced as someone else's parent) — those are never
    // directly bookable (see check_service_hierarchy_depth() /
    // create_booking() in supabase/migrations/20240101000230_booking_engine.sql).
    supabase.from("services").select("id, name_en, parent_service_id").eq("is_active", true).is("deleted_at", null),
    supabase.from("station_services").select("id, station_id, service_id").eq("is_active", true),
    supabase.from("profiles").select("id, full_name").eq("role", "EMPLOYEE").is("deleted_at", null).order("full_name"),
  ]);

  const parentServiceIds = new Set((services ?? []).flatMap((s) => (s.parent_service_id ? [s.parent_service_id] : [])));
  const bookableServiceIds = new Set((services ?? []).filter((s) => !parentServiceIds.has(s.id)).map((s) => s.id));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));

  const bookableServices: BookableService[] = (stationServices ?? []).flatMap((ss) => {
    if (!bookableServiceIds.has(ss.service_id)) return [];
    const name = serviceNameById.get(ss.service_id);
    if (!name) return [];
    return [{ stationServiceId: ss.id, stationId: ss.station_id, serviceId: ss.service_id, serviceName: name }];
  });

  const stationOptions: StationOption[] = (stations ?? []).map((s) => ({ id: s.id, nameEn: s.name_en }));
  const employeeOptions: EmployeeOption[] = (employees ?? []).map((e) => ({ id: e.id, fullName: e.full_name }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">New booking</h1>
      <p className="mt-1 text-sm text-slate-500">
        For an existing customer. A customer who has never booked at your station yet may not show up in search yet —
        ask an owner/manager, or have them book once through the app first.
      </p>

      <Card className="mt-6">
        <BookingWizard stations={stationOptions} services={bookableServices} employees={employeeOptions} />
      </Card>
    </div>
  );
}
