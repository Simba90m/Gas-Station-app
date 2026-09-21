"use server";

import { timingSafeEqual } from "node:crypto";
import type { QueueStatus } from "@gas-station/types";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  publicPhoneSchema,
  publicSendPhoneOtpSchema,
  publicVerifyPhoneOtpSchema,
  publicSendEmailOtpSchema,
  publicVerifyEmailOtpSchema,
  publicStartWalkInSchema,
  publicBookSlotSchema,
} from "./schema";

const MISCONFIGURED_ERROR = "This page isn't available right now — please ask a staff member for help.";
const INVALID_LINK_ERROR = "This link is no longer valid — please scan the QR code at the station again.";
const BAD_CODE_ERROR = "That code is incorrect or has expired — please try again.";
const NOT_SIGNED_IN_ERROR = "Your session expired — please verify your phone number again.";

/**
 * Every action below is reachable by anyone who has this route's URL — it
 * cannot be gated by getCurrentAdminUser() the way the admin dashboard's
 * actions are (there's no signed-in staff member here), so this file's
 * authorization model is deliberately different:
 *
 *  1. A coarse "you're physically at one of our stations" gate: the [token]
 *     route param must match QR_JOIN_TOKEN (checked again in every action
 *     here, never trusted from the page alone — a Server Action is its own
 *     reachable endpoint regardless of which page rendered its trigger).
 *  2. Strict input validation (schema.ts), reusing the one global phone
 *     utility (@gas-station/utils) every other phone field in this app
 *     validates against.
 *  3. A REAL Supabase Auth session, established only after the visitor
 *     verifies a one-time code sent to their own phone, then a second one
 *     sent to their own email (supabase.auth.signInWithOtp/verifyOtp/
 *     updateUser below). Once verified, auth.uid() genuinely is that
 *     customer, so the ordinary owns_customer_row()-gated create_booking()/
 *     join_queue() (used by every other authenticated caller in this app)
 *     are what this file calls too — no service-role bypass, no
 *     sessionless "trust this customer_id" RPCs. See
 *     supabase/migrations/20240101000270_customer_dual_channel_verification.sql
 *     for why this replaces the earlier sessionless kiosk_* design (that
 *     design's own stated reason — "no safe way to prove the visitor IS
 *     that customer, no OTP" — is exactly what OTP verification now
 *     provides).
 *  4. Kiosk hygiene: signOutAction() below is called once the flow reaches
 *     its terminal screen (ticket shown / booking confirmed), so a session
 *     never lingers past a single visit on a device someone else might use
 *     next — even though most customers reach this on their own phone, the
 *     printed/displayed QR code could in principle be scanned on a shared
 *     device too.
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

/** Maps a handful of known Supabase Auth error shapes to friendly copy; everything else falls back to a generic message rather than leaking internals. */
function friendlyAuthError(message: string): string {
  if (/already.*registered|already.*exists/i.test(message)) {
    return "This email is already linked to another account.";
  }
  if (/expired|invalid/i.test(message)) {
    return BAD_CODE_ERROR;
  }
  return MISCONFIGURED_ERROR;
}

async function runPublicAction<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[join/[token]/actions]", message);
    return { error: MISCONFIGURED_ERROR };
  }
}

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
 * The phone-first identification step: does an account already exist for
 * this number? Read-only, anon-safe (customer_phone_registered() returns
 * only a boolean — see supabase/migrations/20240101000260_global_phone_and_kiosk.sql).
 * Drives which screen comes next (a "welcome back" continuation vs. the
 * name-collection form) — never forces full-name entry on a returning
 * customer. Purely a UX branch — ownership is never established by this
 * call, only by the OTP verification that follows.
 */
export async function identifyPhoneAction(
  token: string,
  phone: string,
): Promise<{ exists?: boolean; normalizedPhone?: string; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicPhoneSchema.safeParse({ phone });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid phone number." };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("customer_phone_registered", { p_phone: parsed.data.phone });

    if (error) return { error: error.message };
    return { exists: data ?? false, normalizedPhone: parsed.data.phone };
  });
}

/** Step 1a: send the phone OTP. shouldCreateUser defaults to true — a brand-new phone becomes a new (still unverified-by-email) account, an existing phone just gets a login code; handle_new_user() only fires on the former. */
export async function sendPhoneOtpAction(
  token: string,
  input: { phone: string; fullName: string | null },
): Promise<{ error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicSendPhoneOtpSchema.safeParse({ phone: input.phone, full_name: input.fullName ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone: parsed.data.phone,
      options: { data: { phone: parsed.data.phone, full_name: parsed.data.full_name } },
    });

    if (error) {
      console.error("[sendPhoneOtpAction] signInWithOtp failed:", error.message);
      return { error: friendlyAuthError(error.message) };
    }
    return {};
  });
}

/** Step 1b: verify the phone OTP — this is what actually establishes the real session. Returns whether this customer already has a verified email on file, so the client knows whether to skip straight past the email step. */
export async function verifyPhoneOtpAction(
  token: string,
  input: { phone: string; code: string },
): Promise<{ verified?: boolean; emailVerified?: boolean; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicVerifyPhoneOtpSchema.safeParse({ phone: input.phone, code: input.code });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      phone: parsed.data.phone,
      token: parsed.data.code,
      type: "sms",
    });

    if (error || !data.user) return { error: BAD_CODE_ERROR };

    const { data: profile } = await supabase.from("profiles").select("email").eq("id", data.user.id).single();

    return { verified: true, emailVerified: Boolean(profile?.email) };
  });
}

/** Step 2a: attach + send a confirmation code to the customer's email. Requires the phone-verified session from the previous step. */
export async function sendEmailOtpAction(token: string, email: string): Promise<{ error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicSendEmailOtpSchema.safeParse({ email });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: NOT_SIGNED_IN_ERROR };

    const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
    if (error) {
      console.error("[sendEmailOtpAction] updateUser failed:", error.message);
      return { error: friendlyAuthError(error.message) };
    }
    return {};
  });
}

/** Step 2b: verify the email OTP — sync_profile_email() (the auth.users trigger) copies the now-confirmed address into profiles.email as a side effect of this. */
export async function verifyEmailOtpAction(token: string, input: { email: string; code: string }): Promise<{ verified?: boolean; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicVerifyEmailOtpSchema.safeParse({ email: input.email, code: input.code });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.code,
      type: "email_change",
    });

    if (error) return { error: BAD_CODE_ERROR };
    return { verified: true };
  });
}

export async function getAvailableSlotsPublicAction(
  token: string,
  stationId: string,
  serviceId: string,
  date: string,
): Promise<{ slots: { start: string; end: string }[]; error?: string }> {
  if (!tokenMatches(token)) return { slots: [], error: INVALID_LINK_ERROR };

  const result = await runPublicAction(async () => {
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
 * "Start Now": joins the walk-in queue as the now-verified, signed-in
 * customer, via the same join_queue() every other authenticated caller
 * uses (owns_customer_row() authorizes it — auth.uid() really is this
 * customer at this point).
 */
export async function startWalkInAction(token: string, stationServiceId: string): Promise<{ ticket?: QueueTicket; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  const parsed = publicStartWalkInSchema.safeParse({ station_service_id: stationServiceId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your input and try again." };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: NOT_SIGNED_IN_ERROR };

    const { data: entry, error: joinError } = await supabase.rpc("join_queue", {
      p_customer_id: user.id,
      p_station_service_id: parsed.data.station_service_id,
    });

    if (joinError || !entry) return { error: joinError?.message ?? "Couldn't join the queue — please try again." };

    const { data: status, error: statusError } = await supabase.rpc("get_queue_ticket_status", { p_queue_entry_id: entry.id });
    const row = status?.[0];
    if (statusError || !row) {
      return { error: statusError?.message ?? "Joined the queue, but couldn't load your ticket — please ask a staff member for your position." };
    }

    return { ticket: ticketFromRow(row) };
  });
}

export async function getQueueStatusAction(token: string, queueEntryId: string): Promise<{ ticket?: QueueTicket; error?: string }> {
  if (!tokenMatches(token)) return { error: INVALID_LINK_ERROR };

  return runPublicAction(async () => {
    const supabase = await createClient();
    const { data: status, error } = await supabase.rpc("get_queue_ticket_status", { p_queue_entry_id: queueEntryId });
    const row = status?.[0];
    if (error || !row) return { error: error?.message ?? "Couldn't load your ticket status." };

    return { ticket: ticketFromRow(row) };
  });
}

/**
 * "Book for Later": creates a real booking for the explicitly chosen slot
 * via create_booking() — the same availability engine (get_available_slots)
 * and booking-conflict logic every other authenticated caller uses, as the
 * now-verified, signed-in customer.
 */
export async function bookSlotAction(
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

  return runPublicAction(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: NOT_SIGNED_IN_ERROR };

    const { data, error } = await supabase.rpc("create_booking", {
      p_customer_id: user.id,
      p_station_id: parsed.data.station_id,
      p_service_id: parsed.data.service_id,
      p_start_at: parsed.data.start_at,
    });

    if (error || !data) return { error: error?.message ?? "Couldn't create the booking — please try again." };
    return { bookingId: data.id };
  });
}

/** Kiosk hygiene: called once the flow reaches its terminal screen — see the file-level doc comment, point 4. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
