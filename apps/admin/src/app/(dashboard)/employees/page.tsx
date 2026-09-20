import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { EmployeesTable, type EmployeeRow, type StationOption } from "./employees-table";

export default async function EmployeesPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);

  const [
    { data: profiles, error: profilesError },
    { data: employees },
    { data: assignments },
    { data: stations },
    { data: capabilities },
    { data: services },
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").eq("role", "EMPLOYEE").is("deleted_at", null).order("full_name"),
    supabase.from("employees").select("id, is_active").is("deleted_at", null),
    supabase.from("employee_station_assignments").select("profile_id, station_id"),
    supabase.from("stations").select("id, name_en"),
    supabase.from("employee_service_capabilities").select("employee_id, service_id"),
    supabase.from("services").select("id, name_en"),
  ]);

  const canManage = user?.role === "OWNER" || user?.role === "MANAGER";

  const employeeById = new Map((employees ?? []).map((e) => [e.id, e]));
  const stationNameById = new Map((stations ?? []).map((s) => [s.id, s.name_en]));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));

  const employeeRows: EmployeeRow[] = (profiles ?? []).map((profile) => {
    const stationNames = (assignments ?? [])
      .filter((a) => a.profile_id === profile.id)
      .map((a) => stationNameById.get(a.station_id))
      .filter((name): name is string => Boolean(name));
    const serviceNames = (capabilities ?? [])
      .filter((c) => c.employee_id === profile.id)
      .map((c) => serviceNameById.get(c.service_id))
      .filter((name): name is string => Boolean(name));

    return {
      id: profile.id,
      fullName: profile.full_name,
      phone: profile.phone,
      // employees.is_active is the employment-status toggle this module
      // manages; a missing employees row (RLS-scoped out, or a data race)
      // defaults to showing active rather than a misleading "Inactive".
      isActive: employeeById.get(profile.id)?.is_active ?? true,
      stationNames,
      serviceNames,
    };
  });

  const stationOptions: StationOption[] = (stations ?? []).map((s) => ({ id: s.id, nameEn: s.name_en }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Employees</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canManage
              ? "Everyone with the EMPLOYEE role, across every station you manage."
              : "Employees at your assigned station(s)."}
          </p>
        </div>
        {canManage && (
          <Link href="/employees/new">
            <Button>Add employee</Button>
          </Link>
        )}
      </div>

      {profilesError && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load employees: {profilesError.message}
        </p>
      )}

      <EmployeesTable employees={employeeRows} stations={stationOptions} />
    </div>
  );
}
