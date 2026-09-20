"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateHourRows, type HourRowInput } from "../stations/schema";
import {
  addCapabilitySchema,
  assignStationSchema,
  createShiftSchema,
  employeeDetailsSchema,
  promoteToEmployeeSchema,
} from "./schema";

export interface EmployeeActionState {
  error?: string;
}

function requiredField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Promotes an EXISTING account (must already have signed up — this project
 * defers real account provisioning from the admin UI, see the Phase 6
 * report) to EMPLOYEE via the same set_profile_role() RPC every other role
 * change in this app already goes through, then creates its employees row.
 * Never touches auth.users — no credentials are created here.
 */
export async function promoteToEmployeeAction(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const parsed = promoteToEmployeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();
  // set_profile_role is SECURITY DEFINER and itself checks the caller is
  // OWNER/MANAGER — a station manager submitting this gets a real RPC
  // error here, not a UI that silently pretended to work.
  const { error: roleError } = await supabase.rpc("set_profile_role", {
    p_profile_id: parsed.data.profile_id,
    p_role: "EMPLOYEE",
  });
  if (roleError) return { error: roleError.message };

  const { error: employeeError } = await supabase.from("employees").insert({
    id: parsed.data.profile_id,
    hire_date: parsed.data.hire_date,
    bio_en: parsed.data.bio_en,
    bio_ar: parsed.data.bio_ar,
  });
  if (employeeError) {
    return {
      error: `Promoted to EMPLOYEE, but couldn't create the employee record (${employeeError.message}). Reload and try editing them directly.`,
    };
  }

  revalidatePath("/employees");
  redirect(`/employees/${parsed.data.profile_id}`);
}

export async function updateEmployeeAction(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const employeeId = requiredField(formData, "employee_id");
  if (!employeeId) return { error: "Missing employee id." };

  const parsed = employeeDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();

  // Two tables, two updates: full_name/phone live on profiles
  // (profiles_update_owner_manager), hire_date/bio on employees
  // (employees_update) — kept as separate concerns in the schema, so
  // separate here too, matching profiles.phone/full_name's own privacy
  // boundary rather than merging them into one call.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq("id", employeeId)
    .select("id")
    .single();
  if (profileError) return { error: "You don't have permission to edit this employee, or they no longer exist." };

  const { error: employeeError } = await supabase
    .from("employees")
    .update({ hire_date: parsed.data.hire_date, bio_en: parsed.data.bio_en, bio_ar: parsed.data.bio_ar })
    .eq("id", employeeId)
    .select("id")
    .single();
  if (employeeError) return { error: "You don't have permission to edit this employee's details." };

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return {};
}

export async function setEmployeeActiveAction(employeeId: string, isActive: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").update({ is_active: isActive }).eq("id", employeeId).select("id").single();

  if (error) return { error: "You don't have permission to change this, or they no longer exist." };

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return {};
}

export async function assignStationAction(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const employeeId = requiredField(formData, "employee_id");
  if (!employeeId) return { error: "Missing employee id." };

  const parsed = assignStationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a station." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_station_assignments")
    .insert({ profile_id: employeeId, station_id: parsed.data.station_id });

  if (error) {
    // 23505 = unique_violation: (profile_id, station_id) already exists.
    if (error.code === "23505") return { error: "This employee is already assigned to that station." };
    return { error: error.message };
  }

  revalidatePath(`/employees/${employeeId}`);
  return {};
}

export async function removeStationAssignmentAction(employeeId: string, assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_station_assignments").delete().eq("id", assignmentId).select("id").single();

  if (error) return { error: "You don't have permission to remove this assignment, or it's already gone." };

  revalidatePath(`/employees/${employeeId}`);
  return {};
}

export async function addCapabilityAction(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const employeeId = requiredField(formData, "employee_id");
  if (!employeeId) return { error: "Missing employee id." };

  const parsed = addCapabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a service." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_service_capabilities")
    .insert({ employee_id: employeeId, service_id: parsed.data.service_id });

  if (error) {
    // 23505 = unique_violation: (employee_id, service_id) already exists.
    if (error.code === "23505") return { error: "This employee is already marked capable of that service." };
    return { error: error.message };
  }

  revalidatePath(`/employees/${employeeId}`);
  return {};
}

export async function removeCapabilityAction(employeeId: string, capabilityId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_service_capabilities").delete().eq("id", capabilityId).select("id").single();

  if (error) return { error: "You don't have permission to remove this, or it's already gone." };

  revalidatePath(`/employees/${employeeId}`);
  return {};
}

/**
 * Same shape/validation as upsertStationHoursAction/upsertServiceHoursAction
 * (stations module) — employee_working_hours adds break_starts_at/
 * break_ends_at, which this project's HoursEditor doesn't expose yet, so
 * they're left untouched (NULL) rather than invented here.
 */
export async function upsertEmployeeHoursAction(employeeId: string, rows: HourRowInput[]): Promise<{ error?: string }> {
  const validationError = validateHourRows(rows);
  if (validationError) return { error: validationError };

  const payload = rows.map((row) => ({
    employee_id: employeeId,
    day_of_week: row.day_of_week,
    is_closed: row.mode === "closed",
    is_24_hours: row.mode === "24h",
    starts_at: row.mode === "custom" ? row.opens_at : null,
    ends_at: row.mode === "custom" ? row.closes_at : null,
  }));

  const supabase = await createClient();
  const { data: written, error } = await supabase
    .from("employee_working_hours")
    .upsert(payload, { onConflict: "employee_id,day_of_week" })
    .select("day_of_week");

  if (error) return { error: error.message };
  if (!written || written.length !== rows.length) {
    // Most commonly: this employee has no station assignment yet —
    // employee_working_hours_write requires one to anchor its is_station_staff()
    // check, by design (see the Phase 6 report's "Limitations").
    return { error: "Couldn't save hours — make sure this employee is assigned to at least one station first." };
  }

  revalidatePath(`/employees/${employeeId}`);
  return {};
}

export async function createShiftAction(_prevState: EmployeeActionState, formData: FormData): Promise<EmployeeActionState> {
  const employeeId = requiredField(formData, "employee_id");
  if (!employeeId) return { error: "Missing employee id." };

  const parsed = createShiftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert({
    employee_id: employeeId,
    station_id: parsed.data.station_id,
    started_at: new Date(parsed.data.started_at).toISOString(),
    ended_at: new Date(parsed.data.ended_at).toISOString(),
  });

  if (error) {
    // 23P01/shifts_one_active_per_employee_idx: this specific case doesn't
    // apply here (ended_at is always supplied by this form), but surfaced
    // clearly if it ever does.
    if (error.code === "23505") return { error: "This employee already has an open (no end time) shift." };
    return { error: error.message };
  }

  revalidatePath(`/employees/${employeeId}`);
  return {};
}
