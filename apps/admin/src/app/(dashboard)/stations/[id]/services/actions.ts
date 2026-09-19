"use server";

import { revalidatePath } from "next/cache";
import type { ResourceStatus } from "@gas-station/types";
import { createClient } from "@/lib/supabase/server";
import { validateHourRows, type HourRowInput } from "../../schema";
import { enableServiceSchema, priceOverrideSchema, resourceFormSchema } from "./schema";

export interface ServiceActionState {
  error?: string;
}

function requiredField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value ? value : undefined;
}

/** Adds an existing catalog service to a station's offering — never duplicates the global service row. */
export async function enableServiceAction(_prevState: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const stationId = requiredField(formData, "station_id");
  if (!stationId) return { error: "Missing station id." };

  const parsed = enableServiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Choose a service." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("station_services")
    .insert({ station_id: stationId, service_id: parsed.data.service_id });

  if (error) {
    // 23505 = unique_violation: (station_id, service_id) already exists.
    if (error.code === "23505") return { error: "This service is already enabled at this station." };
    return { error: error.message };
  }

  revalidatePath(`/stations/${stationId}`);
  return {};
}

/** Disables (not deletes) the station's offering — the global service and this row both stay intact. */
export async function setStationServiceActiveAction(
  stationId: string,
  stationServiceId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("station_services")
    .update({ is_active: isActive })
    .eq("id", stationServiceId)
    .select("id")
    .single();

  if (error) return { error: "You don't have permission to change this, or it no longer exists." };

  revalidatePath(`/stations/${stationId}`);
  revalidatePath(`/stations/${stationId}/services/${stationServiceId}`);
  return {};
}

export async function updateStationServicePriceAction(
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const stationId = requiredField(formData, "station_id");
  const stationServiceId = requiredField(formData, "station_service_id");
  if (!stationId || !stationServiceId) return { error: "Missing station or service id." };

  const parsed = priceOverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the price and try again." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("station_services")
    .update({ price_override: parsed.data.price_override })
    .eq("id", stationServiceId)
    .select("id")
    .single();

  if (error) return { error: "You don't have permission to change this, or it no longer exists." };

  revalidatePath(`/stations/${stationId}`);
  revalidatePath(`/stations/${stationId}/services/${stationServiceId}`);
  return {};
}

export async function upsertServiceHoursAction(
  stationId: string,
  stationServiceId: string,
  rows: HourRowInput[],
): Promise<{ error?: string }> {
  const validationError = validateHourRows(rows);
  if (validationError) return { error: validationError };

  const payload = rows.map((row) => ({
    station_service_id: stationServiceId,
    day_of_week: row.day_of_week,
    is_closed: row.mode === "closed",
    is_24_hours: row.mode === "24h",
    opens_at: row.mode === "custom" ? row.opens_at : null,
    closes_at: row.mode === "custom" ? row.closes_at : null,
  }));

  const supabase = await createClient();
  const { data: written, error } = await supabase
    .from("service_operating_hours")
    .upsert(payload, { onConflict: "station_service_id,day_of_week" })
    .select("day_of_week");

  if (error) return { error: error.message };
  if (!written || written.length !== rows.length) {
    return { error: "You don't have permission to edit this service's hours." };
  }

  revalidatePath(`/stations/${stationId}/services/${stationServiceId}`);
  return {};
}

export async function addResourceAction(_prevState: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const stationId = requiredField(formData, "station_id");
  const stationServiceId = requiredField(formData, "station_service_id");
  if (!stationId || !stationServiceId) return { error: "Missing station or service id." };

  const parsed = resourceFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();
  const { error } = await supabase.from("service_resources").insert({
    station_service_id: stationServiceId,
    name_en: parsed.data.name_en,
    name_ar: parsed.data.name_ar,
  });

  if (error) {
    // 23505 = unique_violation: (station_service_id, name_en) already exists.
    if (error.code === "23505") return { error: "A resource with that English name already exists here." };
    return { error: error.message };
  }

  revalidatePath(`/stations/${stationId}/services/${stationServiceId}`);
  return {};
}

export async function setResourceStatusAction(
  stationId: string,
  stationServiceId: string,
  resourceId: string,
  status: ResourceStatus,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("service_resources").update({ status }).eq("id", resourceId).select("id").single();

  if (error) return { error: "You don't have permission to change this, or it no longer exists." };

  revalidatePath(`/stations/${stationId}/services/${stationServiceId}`);
  return {};
}
