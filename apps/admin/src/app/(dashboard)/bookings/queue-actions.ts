"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens (or re-opens) the walk-in queue for one station's offering of a
 * service. A plain upsert through the normal authenticated client — no RPC
 * needed, queues_write RLS (is_station_staff) already covers this exactly.
 */
export async function openQueueAction(stationId: string, stationServiceId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("queues")
    .upsert(
      { station_id: stationId, station_service_id: stationServiceId, is_open: true },
      { onConflict: "station_id,station_service_id" },
    );

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return {};
}

export async function closeQueueAction(queueId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("queues").update({ is_open: false }).eq("id", queueId);

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return {};
}

/** WAITING -> CALLED. Plain update; queue_entries_update_staff RLS covers it, and it's a forward step the transition trigger already allows. */
export async function callNextAction(queueEntryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("queue_entries")
    .update({ status: "CALLED", called_at: new Date().toISOString() })
    .eq("id", queueEntryId);

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return {};
}

/** The "start service creates booking" product decision — see start_queue_service() in supabase/migrations/20240101000250_queue_booking_bridge.sql. */
export async function startServiceAction(
  queueEntryId: string,
  employeeId: string | null,
): Promise<{ bookingId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_queue_service", {
    p_queue_entry_id: queueEntryId,
    p_employee_id: employeeId,
  });

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return { bookingId: data?.id };
}

export async function completeServiceAction(queueEntryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_queue_service", { p_queue_entry_id: queueEntryId });

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return {};
}

export async function cancelQueueEntryAction(queueEntryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("queue_entries").update({ status: "CANCELLED" }).eq("id", queueEntryId);

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return {};
}

export async function noShowQueueEntryAction(queueEntryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("queue_entries").update({ status: "NO_SHOW" }).eq("id", queueEntryId);

  if (error) return { error: error.message };
  revalidatePath("/bookings");
  return {};
}
