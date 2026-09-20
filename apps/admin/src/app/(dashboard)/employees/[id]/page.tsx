import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoursEditor } from "../../stations/hours-editor";
import { upsertEmployeeHoursAction } from "../actions";
import { EmployeeForm } from "./employee-form";
import { ActivateToggle } from "./activate-toggle";
import { StationAssignmentsPanel } from "./station-assignments-panel";
import { CapabilitiesPanel } from "./capabilities-panel";
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
    { data: hours },
    { data: shifts },
  ] = await Promise.all([
    supabase.from("employee_station_assignments").select("id, station_id, is_primary").eq("profile_id", id),
    supabase.from("stations").select("id, name_en").is("deleted_at", null).order("name_en"),
    supabase.from("employee_service_capabilities").select("id, service_id").eq("employee_id", id),
    supabase.from("services").select("id, name_en").eq("is_active", true).is("deleted_at", null).order("name_en"),
    supabase.from("employee_working_hours").select("*").eq("employee_id", id),
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
        <h2 className="text-sm font-semibold text-slate-900">Working hours</h2>
        <p className="mt-1 text-sm text-slate-500">
          When this employee is normally available. Requires at least one station assignment above first.
        </p>
        <div className="mt-4">
          {assignmentRows.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Assign this employee to a station first — working hours can&apos;t be saved until they are.
            </p>
          ) : (
            <HoursEditor
              initialRows={(hours ?? []).map((h) => ({
                day_of_week: h.day_of_week,
                is_closed: h.is_closed,
                is_24_hours: h.is_24_hours,
                opens_at: h.starts_at,
                closes_at: h.ends_at,
              }))}
              onSave={upsertEmployeeHoursAction.bind(null, employee.id)}
            />
          )}
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
