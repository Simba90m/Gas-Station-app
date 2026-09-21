import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmployeeForm } from "./employee-form";
import { ActivateToggle } from "./activate-toggle";
import { StationAssignmentsPanel } from "./station-assignments-panel";
import { CapabilitiesPanel } from "./capabilities-panel";
import { StationSchedulePanel } from "./station-schedule-panel";
import { ShiftsPanel } from "./shifts-panel";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile, error: profileError }, { data: employee, error: employeeError }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone, role").eq("id", id).eq("role", "EMPLOYEE").single(),
    supabase.from("employees").select("*").eq("id", id).single(),
  ]);

  if (profileError || !profile || employeeError || !employee) {
    // "Doesn't exist," "isn't an EMPLOYEE," and "you don't have access" are
    // all indistinguishable from the outside under RLS — the same safe
    // default the stations module already uses.
    notFound();
  }

  const [
    { data: assignments },
    { data: stations },
    { data: capabilities },
    { data: services },
    { data: schedule },
    { data: shifts },
  ] = await Promise.all([
    supabase.from("employee_station_assignments").select("id, station_id, is_primary").eq("profile_id", id),
    supabase.from("stations").select("id, name_en").is("deleted_at", null).order("name_en"),
    supabase.from("employee_service_capabilities").select("id, service_id").eq("employee_id", id),
    // Only bookable services need a capability — Fuel/café content never
    // go through the booking/queue journey, so an employee "performing"
    // them isn't a meaningful concept. See
    // supabase/migrations/20240101000300_service_category.sql.
    supabase
      .from("services")
      .select("id, name_en")
      .eq("is_active", true)
      .eq("category", "BOOKABLE")
      .is("deleted_at", null)
      .order("name_en"),
    supabase.from("employee_station_schedule").select("*").eq("employee_id", id),
    supabase.from("shifts").select("id, station_id, started_at, ended_at").eq("employee_id", id).order("started_at", { ascending: false }),
  ]);

  const stationNameById = new Map((stations ?? []).map((s) => [s.id, s.name_en]));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));

  const assignedStationIds = new Set((assignments ?? []).map((a) => a.station_id));
  const assignmentRows = (assignments ?? []).flatMap((a) => {
    const stationName = stationNameById.get(a.station_id);
    if (!stationName) return [];
    return [{ assignmentId: a.id, stationId: a.station_id, stationName, isPrimary: a.is_primary }];
  });
  const availableStations = (stations ?? [])
    .filter((s) => !assignedStationIds.has(s.id))
    .map((s) => ({ id: s.id, nameEn: s.name_en }));

  const capableServiceIds = new Set((capabilities ?? []).map((c) => c.service_id));
  const capabilityRows = (capabilities ?? []).flatMap((c) => {
    const serviceName = serviceNameById.get(c.service_id);
    if (!serviceName) return [];
    return [{ capabilityId: c.id, serviceId: c.service_id, serviceName }];
  });
  const availableServices = (services ?? [])
    .filter((s) => !capableServiceIds.has(s.id))
    .map((s) => ({ id: s.id, nameEn: s.name_en }));

  // The add-schedule form only offers stations this employee is already
  // assigned to — a schedule row for any other station is rejected by
  // check_schedule_station_assignment() anyway (see
  // supabase/migrations/20240101000310_employee_station_schedule.sql), so
  // this keeps the owner from picking a choice that would just bounce.
  const assignedStationOptions = assignmentRows.map((a) => ({ id: a.stationId, nameEn: a.stationName }));
  const scheduleRows = (schedule ?? []).flatMap((row) => {
    const stationName = stationNameById.get(row.station_id);
    if (!stationName) return [];
    return [
      {
        scheduleId: row.id,
        stationId: row.station_id,
        stationName,
        dayOfWeek: row.day_of_week,
        startsAt: row.starts_at ?? "00:00:00",
        endsAt: row.ends_at ?? "00:00:00",
      },
    ];
  });

  const shiftRows = (shifts ?? []).flatMap((shift) => {
    const stationName = stationNameById.get(shift.station_id);
    if (!stationName) return [];
    return [{ id: shift.id, stationName, startedAt: shift.started_at, endedAt: shift.ended_at }];
  });

  const stationOptionsForShifts = (stations ?? []).map((s) => ({ id: s.id, nameEn: s.name_en }));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{profile.full_name}</h1>
          <div className="mt-1">
            <Badge tone={employee.is_active ? "green" : "gray"}>{employee.is_active ? "Active" : "Inactive"}</Badge>
          </div>
        </div>
        <ActivateToggle employeeId={employee.id} isActive={employee.is_active} />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Employee information</h2>
        <div className="mt-4">
          <EmployeeForm
            employeeId={employee.id}
            defaultValues={{
              full_name: profile.full_name,
              phone: profile.phone,
              hire_date: employee.hire_date,
              bio_en: employee.bio_en,
              bio_ar: employee.bio_ar,
            }}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Assigned stations</h2>
        <p className="mt-1 text-sm text-slate-500">An employee can be assigned to more than one station.</p>
        <div className="mt-4">
          <StationAssignmentsPanel employeeId={employee.id} assignments={assignmentRows} available={availableStations} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Service capabilities</h2>
        <p className="mt-1 text-sm text-slate-500">
          Which catalog services this employee can perform — independent of which stations they&apos;re assigned to
          (a station also has to offer the service for it to actually matter there).
        </p>
        <div className="mt-4">
          <CapabilitiesPanel employeeId={employee.id} capabilities={capabilityRows} available={availableServices} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Station schedule</h2>
        <p className="mt-1 text-sm text-slate-500">
          Where and when this employee actually works — not a permanent station, just whichever days/times they&apos;re
          scheduled. An employee can work different stations on different days, or even split one day between two
          stations (e.g. Station 1 mornings, Station 2 afternoons). Requires at least one station assignment above
          first.
        </p>
        <div className="mt-4">
          <StationSchedulePanel employeeId={employee.id} schedule={scheduleRows} stations={assignedStationOptions} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Shifts</h2>
        <p className="mt-1 text-sm text-slate-500">
          Actual worked shifts, most recent first. Supports overnight shifts (e.g. 22:00 → 04:00) — just pick the
          later calendar day for the end time.
        </p>
        <div className="mt-4">
          <ShiftsPanel employeeId={employee.id} shifts={shiftRows} stations={stationOptionsForShifts} />
        </div>
      </Card>
    </div>
  );
}
