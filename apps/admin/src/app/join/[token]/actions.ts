"use server";

import { timingSafeEqual } from "node:crypto";
import type { QueueStatus } from "@gas-station/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createCustomerAccount } from "@/lib/customer-account";
import { env } from "@/lib/env";
import { publicPhoneSchema, publicStartWalkInSchema, publicBookSlotSchema } from "./schema";

const MISCONFIGURED_ERROR = "This page isn't available right now — please ask a staff member for help.";

/** createAdminClient() throws synchronously if SUPABASE_SERVICE_ROLE_KEY is
 * missing — every action below that needs it wraps its call in this so a
 * genuinely misconfigured server never escapes as an uncaught exception
 * (which would replace this whole page with an error screen instead of a
 * normal, localized error message — see createCustomerAction's own
 * try/catch in (dashboard)/bookings/actions.ts for the original of this
 * exact failure mode). */
async function runKioskAction<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[join/[token]/actions]", message);
    return { error: MISCONFIGURED_ERROR };
  }
}

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
 *  2. Strict input validation (schema.ts), reusing the one global phone
 *     utility (@gas-station/utils) every other phone field in this app
 *     validates against.
 *  3. No browser session, for anyone, new or returning. An earlier version
 *     of this flow signed a brand-new customer into a real session — that
 *     depended on Supabase's Phone auth provider (or, in a since-reverted
 *     attempt, still needed *some* sign-in mechanism), and had no safe way
 *     to extend the same idea to a RETURNING customer at all (resetting
 *     their real password and signing in as them would let anyone who
 *     merely knows their phone number impersonate them with a full
 *     session — view/cancel their real bookings, etc. — which is exactly
 *     the kind of broad privilege bypass this project's standing rules
 *     forbid). So neither path ever establishes a session. Every
 *     privileged action goes through the sessionless kiosk_* Postgres
 *     functions instead (supabase/migrations/20240101000260_global_phone_and_kiosk.sql)
 *     — service_role-only, called with an already-resolved customer_id,
 *     narrowly scoped to "join this one queue" / "create this one
 *     booking", nothing more (no profile/data access, no way to touch any
 *     of that customer's OTHER bookings). The residual risk — someone who
 *     knows or guesses another person's phone number could add a walk-in
 *     entry under their name — is a low-severity nuisance, not an account
 *     takeover, and no different in kind from a staff member already being
 *     able to do the same today via the admin "search by phone, book for
 *     them" flow; it just doesn't require a staff member to be the one
 *     doing it.
 *  4. A brand-new customer's account is still created here with the
 *     service-role admin client, but via the SAME shared helper
 *     (lib/customer-account.ts) the staff-only createCustomerAction uses —
 *     not a second copy of that logic — and a phone that already has an
 *     account is never silently reused to fabricate a duplicate; it's
 *     looked up and continued instead (see startWalkInAction/bookSlotAction).
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

export interface QueueTicket {
  queueEntryId: string;
  position: number;
  status: QueueStatus;
  rank: number;
  estimatedWaitMinutes: number;
}

// The RPC's own return column is queue_position, not position — POSITION
// is a reserved SQL keyword and can't be an unquoted RETURNS TABLE column
// name (see supabase/migrations/20240101000260_global_phone_and_kiosk.sql).
// QueueTicket.position (this app's own name for it) is unaffected.
function ticketFromRow(row: {
  id: string;
  queue_position: number;
  status: QueueStatus;
  rank: number;
  estimated_wait_minutes: number;
}): QueueTicket {
  return {
    queueEntryId: row.id,
    position: row.queue_position,
    status: row.status,
    rank: row.rank,
    estimatedWaitMinutes: row.estimated_wait_minutes,
  };
}

/**
 * Looks up an already-created customer by phone via the service-role
 * client (profiles isn't anon-readable, and this needs the real id, unlike
 * the anon-safe boolean-only customer_phone_registered() RPC the phone-
 * identify step uses). Internal to this file — the customer_id it resolves
 * is never sent back to the browser.
 */
async function resolveOrCreateCustomerId(input: {
  phone: string;
  fullName: string | null;
}): Promise<{ customerId: string } | { error: string }> {
  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", input.phone)
    .eq("role", "CUSTOMER")
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError) {
    console.error("[resolveOrCreateCustomerId] lookup failed:", lookupError.message);
    return { error: "Something went wrong — please try again." };
  }

  if (existing) return { customerId: existing.id };

  if (!input.fullName) {
    return { error: "This phone number isn't registered yet — enter your name to create an account." };
  }

  const created = await createCustomerAccount({ fullName: input.fullName, phone: input.phone });
  if (created.error || !created.customerId) {
    return { error: created.error ?? "Couldn't create your account — please try again." };
  }
  return { customerId: created.customerId };
}

/**
 * The phone-first identification step: does an account already exist for
 * this number? Read-only, anon-safe (customer_phone_registered() returns
 * only a boolean — see the migration for why). Drives which screen comes
 * next (a "welcome back" continuation vs. the name-collection form) —
 * never forces "Create Account" on a returning customer.
 */
export async function identifyPhoneAction(
  token: string,
  phone: string,
): Promise<{ exists?: boolean; normalizedPhone?: string; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicPhoneSchema.safeParse({ phone });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid phone number." };

  return runKioskAction(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("customer_phone_registered", { p_phone: parsed.data.phone });

    if (error) return { error: error.message };
    return { exists: data ?? false, normalizedPhone: parsed.data.phone };
  });
}

export async function getAvailableSlotsPublicAction(
  token: string,
  stationId: string,
  serviceId: string,
  date: string,
): Promise<{ slots: { start: string; end: string }[]; error?: string }> {
  if (!tokenMatches(token)) return { slots: [], error: INVALID_LINK_ERROR };

  const result = await runKioskAction(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_available_slots", {
      p_station_id: stationId,
      p_service_id: serviceId,
      p_date: date,
    });

    if (error) return { slots: [], error: error.message };
    return { slots: (data ?? []).map((row) => ({ start: row.slot_start, end: row.slot_end })) };
  });
  return "slots" in result ? result : { slots: [], error: result.error };
}

/**
 * "Start Now": resolves (or, for a genuinely new phone, creates) the
 * customer, then joins the walk-in queue via kiosk_join_queue() — never
 * shows/uses future booking slots.
 */
export async function startWalkInAction(
  token: string,
  input: { phone: string; fullName: string | null; stationServiceId: string },
): Promise<{ ticket?: QueueTicket; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicStartWalkInSchema.safeParse({
    phone: input.phone,
    full_name: input.fullName ?? undefined,
    station_service_id: input.stationServiceId,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  return runKioskAction(async () => {
    const resolved = await resolveOrCreateCustomerId({ phone: parsed.data.phone, fullName: parsed.data.full_name });
    if ("error" in resolved) return { error: resolved.error };

    const admin = createAdminClient();
    const { data: entry, error: joinError } = await admin.rpc("kiosk_join_queue", {
      p_customer_id: resolved.customerId,
      p_station_service_id: parsed.data.station_service_id,
    });

    if (joinError || !entry) return { error: joinError?.message ?? "Couldn't join the queue — please try again." };

    const { data: status, error: statusError } = await admin.rpc("kiosk_queue_status", { p_queue_entry_id: entry.id });
    const row = status?.[0];
    if (statusError || !row) {
      return { error: statusError?.message ?? "Joined the queue, but couldn't load your ticket — please ask a staff member for your position." };
    }

    return { ticket: ticketFromRow(row) };
  });
}

export async function getQueueStatusAction(token: string, queueEntryId: string): Promise<{ ticket?: QueueTicket; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  return runKioskAction(async () => {
    const admin = createAdminClient();
    const { data: status, error } = await admin.rpc("kiosk_queue_status", { p_queue_entry_id: queueEntryId });
    const row = status?.[0];
    if (error || !row) return { error: error?.message ?? "Couldn't load your ticket status." };

    return { ticket: ticketFromRow(row) };
  });
}

/**
 * "Book for Later": resolves/creates the customer the same way as
 * startWalkInAction, then creates a real booking for the explicitly chosen
 * slot via kiosk_create_booking() — the existing availability engine
 * (get_available_slots) and booking-conflict logic, not a second copy.
 */
export async function bookSlotAction(
  token: string,
  input: { phone: string; fullName: string | null; stationId: string; serviceId: string; startAt: string },
): Promise<{ bookingId?: string; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicBookSlotSchema.safeParse({
    phone: input.phone,
    full_name: input.fullName ?? undefined,
    station_id: input.stationId,
    service_id: input.serviceId,
    start_at: input.startAt,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  return runKioskAction(async () => {
    const resolved = await resolveOrCreateCustomerId({ phone: parsed.data.phone, fullName: parsed.data.full_name });
    if ("error" in resolved) return { error: resolved.error };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("kiosk_create_booking", {
      p_customer_id: resolved.customerId,
      p_station_id: parsed.data.station_id,
      p_service_id: parsed.data.service_id,
      p_start_at: parsed.data.start_at,
    });

    if (error || !data) return { error: error?.message ?? "Couldn't create the booking — please try again." };
    return { bookingId: data.id };
  });
}
