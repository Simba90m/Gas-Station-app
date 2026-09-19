"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stationFormSchema, type HourRowInput } from "./schema";

export interface StationFormState {
  error?: string;
}

function parseStationForm(formData: FormData): { data?: ReturnType<typeof stationFormSchema.parse>; error?: string } {
  const parsed = stationFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };
  }
  return { data: parsed.data };
}

export async function createStationAction(_prevState: StationFormState, formData: FormData): Promise<StationFormState> {
  const { data, error } = parseStationForm(formData);
  if (error || !data) return { error };

  const supabase = await createClient();
  // RLS (stations_insert) only allows OWNER/MANAGER — a station manager
  // submitting this form gets a real error from Postgres here, not a UI
  // that silently pretended to work.
  const { data: created, error: dbError } = await supabase.from("stations").insert(data).select("id").single();

  if (dbError) {
    return { error: dbError.message };
  }

  revalidatePath("/stations");
  redirect(`/stations/${created.id}`);
}

export async function updateStationAction(_prevState: StationFormState, formData: FormData): Promise<StationFormState> {
  const stationId = formData.get("station_id");
  if (typeof stationId !== "string" || !stationId) {
    return { error: "Missing station id." };
  }

  const { data, error } = parseStationForm(formData);
  if (error || !data) return { error };

  const supabase = await createClient();
  // .select().single() is not just for the return value: it's what turns
  // "RLS silently matched 0 rows" (which a bare .update().eq() would report
  // as a false success — verified against a real RLS-enforced database
  // while building this) into a real, reportable error via .single()'s
  // "expected exactly one row" check.
  const { error: dbError } = await supabase.from("stations").update(data).eq("id", stationId).select("id").single();

  if (dbError) {
    return { error: "You don't have permission to edit this station, or it no longer exists." };
  }

  revalidatePath("/stations");
  revalidatePath(`/stations/${stationId}`);
  return {};
}

export async function setStationActiveAction(stationId: string, isActive: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("stations")
    .update({ is_active: isActive })
    .eq("id", stationId)
    .select("id")
    .single();

  if (error) return { error: "You don't have permission to change this station, or it no longer exists." };

  revalidatePath("/stations");
  revalidatePath(`/stations/${stationId}`);
  return {};
}

export async function upsertStationHoursAction(
  stationId: string,
  rows: HourRowInput[],
): Promise<{ error?: string }> {
  for (const row of rows) {
    if (row.mode === "custom" && (!row.opens_at || !row.closes_at)) {
      return { error: "Set both an opening and closing time, or choose Closed / 24 hours instead." };
    }
    if (row.mode === "custom" && row.opens_at === row.closes_at) {
      return { error: "Opening and closing time can't be the same — for 24 hours, use the 24 Hours option instead." };
    }
  }

  const payload = rows.map((row) => ({
    station_id: stationId,
    day_of_week: row.day_of_week,
    is_closed: row.mode === "closed",
    is_24_hours: row.mode === "24h",
    opens_at: row.mode === "custom" ? row.opens_at : null,
    closes_at: row.mode === "custom" ? row.closes_at : null,
  }));

  const supabase = await createClient();
  // Same "detect RLS silently matching fewer rows than expected" concern as
  // updateStationAction — request the written rows back and compare counts,
  // rather than trusting a lack of `error` alone.
  const { data: written, error } = await supabase
    .from("station_operating_hours")
    .upsert(payload, { onConflict: "station_id,day_of_week" })
    .select("day_of_week");

  if (error) return { error: error.message };
  if (!written || written.length !== rows.length) {
    return { error: "You don't have permission to edit this station's hours." };
  }

  revalidatePath(`/stations/${stationId}`);
  return {};
}
