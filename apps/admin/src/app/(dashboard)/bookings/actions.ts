"use server";

import { revalidatePath } from "next/cache";
import type { BookingStatus } from "@gas-station/types";
import { getCurrentAdminUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelBookingSchema, createCustomerSchema, createManualBookingSchema } from "./schema";

export async function updateBookingStatusAction(bookingId: string, status: BookingStatus): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update({ status }).eq("id", bookingId).select("id").single();

  if (error) {
    return { error: "Couldn't update this booking's status — it may have changed since you loaded this page, or that transition isn't allowed." };
  }

  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return {};
}

export async function cancelBookingAction(bookingId: string, reason: string): Promise<{ error?: string }> {
  const parsed = cancelBookingSchema.safeParse({ cancellation_reason: reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the reason and try again." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "CANCELLED", cancellation_reason: parsed.data.cancellation_reason })
    .eq("id", bookingId)
    .select("id")
    .single();

  if (error) return { error: "Couldn't cancel this booking — it may have already changed." };

  revalidatePath("/bookings");
  revalidatePath(`/bookings/${bookingId}`);
  return {};
}

export interface CustomerSearchResult {
  id: string;
  fullName: string;
  phone: string | null;
}

/**
 * Search is naturally scoped by profiles' own RLS, not filtered again here:
 * OWNER/MANAGER can find any customer (profiles_select_owner_manager);
 * station-level staff only find a customer who already has a booking
 * relationship with their station (profiles_select_related_via_booking) —
 * a customer new to that station's staff genuinely won't show up yet. Two
 * separate ilike queries (not a single combined `.or()` filter string) so
 * user-typed search text never has to be embedded in PostgREST's
 * comma-separated filter syntax.
 */
export async function searchCustomersAction(query: string): Promise<{ results: CustomerSearchResult[]; error?: string }> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [] };

  const supabase = await createClient();
  const [byName, byPhone] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("role", "CUSTOMER")
      .is("deleted_at", null)
      .ilike("full_name", `%${trimmed}%`)
      .order("full_name")
      .limit(10),
    supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("role", "CUSTOMER")
      .is("deleted_at", null)
      .ilike("phone", `%${trimmed}%`)
      .order("full_name")
      .limit(10),
  ]);

  if (byName.error && byPhone.error) return { results: [], error: byName.error.message };

  const merged = new Map<string, CustomerSearchResult>();
  for (const row of [...(byName.data ?? []), ...(byPhone.data ?? [])]) {
    merged.set(row.id, { id: row.id, fullName: row.full_name, phone: row.phone });
  }
  return { results: Array.from(merged.values()) };
}

/**
 * Creates a real auth.users account for a walk-in customer, then hands
 * back its id — the one operation in this app a plain `authenticated`
 * session structurally cannot do (auth.users is never writable directly;
 * see supabase/migrations/20240101000070_auth_handlers.sql). Unlike every
 * other privileged operation in this schema, there's no SECURITY DEFINER
 * Postgres function that can do this instead, because it isn't a table
 * write at all — it's a call to Supabase's Auth Admin API, which only the
 * service role key can make. That's why this is the one place this app
 * uses lib/supabase/admin.ts.
 *
 * Security: the service role client itself has no notion of who's
 * calling, so this function does its own authorization check first
 * (mirrors how create_booking() reimplements bookings_insert's RLS check
 * for the same reason: the privileged mechanism bypasses the normal
 * boundary, so the check has to happen explicitly here instead). No RLS
 * policy changes, no new table grants — handle_new_user() (already
 * SECURITY DEFINER, unchanged) creates the matching profiles/customers
 * rows exactly as it does for every other real signup, in the same
 * transaction as the auth.users insert.
 */
export async function createCustomerAction(input: {
  fullName: string;
  phone: string;
}): Promise<{ customer?: CustomerSearchResult; error?: string }> {
  const admin = await getCurrentAdminUser();
  if (!admin) return { error: "You don't have permission to create a customer." };

  const parsed = createCustomerSchema.safeParse({ full_name: input.fullName, phone: input.phone });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabaseAdmin = createAdminClient();
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    phone: parsed.data.phone,
    phone_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (error || !data.user) {
    if (/already|exists/i.test(error?.message ?? "")) {
      return { error: "A customer with this phone number already exists — try searching instead." };
    }
    return { error: error?.message || "Couldn't create the customer account." };
  }

  return {
    customer: { id: data.user.id, fullName: parsed.data.full_name, phone: parsed.data.phone },
  };
}

export interface AvailableSlot {
  start: string;
  end: string;
  employeeIds: string[];
  resourceIds: string[];
}

export async function getAvailableSlotsAction(
  stationId: string,
  serviceId: string,
  date: string,
): Promise<{ slots: AvailableSlot[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_station_id: stationId,
    p_service_id: serviceId,
    p_date: date,
  });

  if (error) return { slots: [], error: error.message };
  return {
    slots: (data ?? []).map((row) => ({
      start: row.slot_start,
      end: row.slot_end,
      employeeIds: row.candidate_employee_ids ?? [],
      resourceIds: row.candidate_resource_ids ?? [],
    })),
  };
}

export async function createManualBookingAction(input: {
  customerId: string;
  stationId: string;
  serviceId: string;
  startAt: string;
  employeeId: string | null;
  notes: string | null;
}): Promise<{ bookingId?: string; error?: string }> {
  const parsed = createManualBookingSchema.safeParse({
    customer_id: input.customerId,
    station_id: input.stationId,
    service_id: input.serviceId,
    start_at: input.startAt,
    employee_id: input.employeeId,
    notes: input.notes ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();
  // create_booking() re-checks authorization and availability itself
  // (SECURITY DEFINER bypasses RLS) — this action is a thin wrapper, not a
  // second place that decides whether the booking is allowed.
  const { data, error } = await supabase.rpc("create_booking", {
    p_customer_id: parsed.data.customer_id,
    p_station_id: parsed.data.station_id,
    p_service_id: parsed.data.service_id,
    p_start_at: parsed.data.start_at,
    p_employee_id: parsed.data.employee_id,
    p_notes: parsed.data.notes,
  });

  if (error) return { error: error.message };

  revalidatePath("/bookings");
  return { bookingId: data?.id };
}
