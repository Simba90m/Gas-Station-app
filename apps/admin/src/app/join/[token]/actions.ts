"use server";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { publicJoinCustomerSchema, publicJoinQueueSchema, publicBookSlotSchema } from "./schema";

/**
 * Every action below is reachable by anyone who has this route's URL — it
 * cannot be gated by getCurrentAdminUser() the way createCustomerAction is
 * (there's no signed-in staff member here to check), so this file's
 * authorization model is deliberately different, not a copy of it:
 *
 *  1. A coarse "you're physically at one of our stations" gate: the [token]
 *     route param must match QR_JOIN_TOKEN (checked again in every action
 *     here, never trusted from the page alone — a Server Action is its own
 *     reachable endpoint regardless of which page rendered its trigger).
 *  2. Strict input validation (schema.ts).
 *  3. A real customer account, created here with the service-role admin
 *     client exactly like createCustomerAction does — but instead of also
 *     signing the visitor's browser into it directly, joinAsNewCustomerAction
 *     immediately establishes a genuine Supabase Auth session for that new
 *     account (see below). Every subsequent privileged operation
 *     (join_queue, create_booking) then runs as an ordinary authenticated
 *     customer call, through the exact same RLS/RPC authorization already
 *     audited for the staff-driven booking flow — nothing here duplicates
 *     or re-derives that logic.
 *  4. A phone number that already has an account is refused, never reused —
 *     a phone number isn't proof of identity, so silently signing the
 *     visitor into an existing account by phone alone would let anyone who
 *     knows a real customer's number impersonate them from this public,
 *     unauthenticated page.
 */
function tokenMatches(token: string): boolean {
  let expectedRaw: string;
  try {
    expectedRaw = env.qrJoinToken();
  } catch {
    // Misconfigured server (QR_JOIN_TOKEN unset) — fail closed, not open.
    return false;
  }
  const expected = Buffer.from(expectedRaw);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

const INVALID_LINK_ERROR = "This link is no longer valid — please scan the QR code at the station again.";
const SESSION_EXPIRED_ERROR = "Your session expired — please start again from the QR code.";

export interface PublicStationOption {
  id: string;
  nameEn: string;
}

export interface PublicServiceOption {
  stationServiceId: string;
  stationId: string;
  serviceId: string;
  serviceName: string;
  queueIsOpen: boolean;
}

/**
 * Creates a brand-new customer account for the public self-service flow and
 * signs this browser into it for real. The throwaway password only ever
 * exists inside this one request — never shown to the customer, never
 * stored — it exists purely so signInWithPassword() below can mint a
 * genuine session; a real login mechanism (OTP) is Phase 7.4's job, not
 * this walk-in convenience path's.
 */
export async function joinAsNewCustomerAction(
  token: string,
  input: { fullName: string; phone: string },
): Promise<{ error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicJoinCustomerSchema.safeParse({ full_name: input.fullName, phone: input.phone });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((issue) => issue.message).join(" ") || "Check your input and try again." };
  }

  const throwawayPassword = randomBytes(32).toString("hex");

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      phone: parsed.data.phone,
      phone_confirm: true,
      password: throwawayPassword,
      user_metadata: { full_name: parsed.data.full_name },
    });

    if (error || !data.user) {
      if (/already|exists/i.test(error?.message ?? "")) {
        return {
          error:
            "This phone number already has an account. Please use the Gas Station app to book or join the queue, or ask a staff member for help.",
        };
      }
      return { error: "Couldn't create your account — please ask a staff member for help." };
    }

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      phone: parsed.data.phone,
      password: throwawayPassword,
    });

    if (signInError) {
      return { error: "Your account was created, but we couldn't sign you in — please ask a staff member for help." };
    }

    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create your account.";
    console.error("[joinAsNewCustomerAction]", message);
    return { error: "This page isn't available right now — please ask a staff member for help." };
  }
}

export async function getAvailableSlotsPublicAction(
  token: string,
  stationId: string,
  serviceId: string,
  date: string,
): Promise<{ slots: { start: string; end: string }[]; error?: string }> {
  if (!tokenMatches(token)) return { slots: [], error: INVALID_LINK_ERROR };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_station_id: stationId,
    p_service_id: serviceId,
    p_date: date,
  });

  if (error) return { slots: [], error: error.message };
  return { slots: (data ?? []).map((row) => ({ start: row.slot_start, end: row.slot_end })) };
}

export async function joinQueuePublicAction(
  token: string,
  input: { stationServiceId: string },
): Promise<{ error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicJoinQueueSchema.safeParse({ station_service_id: input.stationServiceId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SESSION_EXPIRED_ERROR };

  const { error } = await supabase.rpc("join_queue", {
    p_customer_id: user.id,
    p_station_service_id: parsed.data.station_service_id,
  });

  if (error) return { error: error.message };
  return {};
}

export async function bookSlotPublicAction(
  token: string,
  input: { stationId: string; serviceId: string; startAt: string },
): Promise<{ bookingId?: string; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicBookSlotSchema.safeParse({
    station_id: input.stationId,
    service_id: input.serviceId,
    start_at: input.startAt,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: SESSION_EXPIRED_ERROR };

  const { data, error } = await supabase.rpc("create_booking", {
    p_customer_id: user.id,
    p_station_id: parsed.data.station_id,
    p_service_id: parsed.data.service_id,
    p_start_at: parsed.data.start_at,
  });

  if (error) return { error: error.message };
  return { bookingId: data?.id };
}
