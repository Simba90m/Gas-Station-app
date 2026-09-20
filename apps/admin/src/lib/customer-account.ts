import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

const SYNTHETIC_EMAIL_DOMAIN = "customers.invalid";

export interface CreateCustomerAccountInput {
  fullName: string;
  /** Already-normalized E.164 (see @gas-station/utils normalizeToE164). */
  phone: string;
}

export interface CreateCustomerAccountResult {
  customerId?: string;
  error?: string;
  duplicatePhone?: boolean;
}

/**
 * Creates a real auth.users account for a customer, then hands back its id
 * — the one operation this app cannot do through a plain `authenticated`
 * session (auth.users is not writable directly; see
 * supabase/migrations/20240101000070_auth_handlers.sql). Shared by both the
 * admin-staff-driven flow ((dashboard)/bookings/actions.ts
 * createCustomerAction) and the public QR kiosk flow
 * (join/[token]/actions.ts) — one function, not two copies of the same
 * account-creation logic.
 *
 * Uses a synthetic, never-shown, never-emailed ".invalid" address (RFC
 * 2606 — reserved specifically so it can never resolve to a real domain)
 * as the Supabase Auth identifier, instead of the customer's real phone
 * number. This is the actual root-cause fix for the public flow's
 * "Couldn't create an account" error: creating a user by `phone` depends
 * on the hosted Supabase project having its Phone auth provider enabled
 * (real SMS infrastructure this project has never configured —
 * `phone_confirm: true` only skips SENDING an OTP, it does not skip the
 * provider needing to be enabled at all), which was silently failing every
 * phone-based `createUser()` call, in both call sites. Email/password is
 * Supabase's default, always-enabled provider, so this has no such
 * dependency. The customer's real phone goes in `user_metadata.phone`,
 * which `handle_new_user()` (unchanged) already copies into
 * `profiles.phone` exactly as before — nobody ever sees or uses the
 * synthetic email or the throwaway password; neither call site signs in
 * with them (see join/[token]/actions.ts for why the public flow no longer
 * needs a browser session at all).
 *
 * Duplicate phones are now caught for real by profiles_phone_unique_idx
 * (see supabase/migrations/20240101000260_global_phone_and_kiosk.sql) —
 * callers should still check customer_phone_registered() first (the public
 * flow's whole point is to never reach this function at all for an
 * existing customer), this is the safety net for the rare simultaneous-
 * signup race, not the primary duplicate-prevention path.
 */
export async function createCustomerAccount(input: CreateCustomerAccountInput): Promise<CreateCustomerAccountResult> {
  const admin = createAdminClient();
  const throwawayPassword = randomBytes(32).toString("hex");
  const syntheticEmail = `phone-${input.phone.replace(/^\+/, "")}-${randomBytes(4).toString("hex")}@${SYNTHETIC_EMAIL_DOMAIN}`;

  const { data, error } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    password: throwawayPassword,
    user_metadata: { full_name: input.fullName, phone: input.phone },
  });

  if (error || !data.user) {
    const message = error?.message ?? "unknown error";
    // Always logged, not just on the generic fallback below — the previous
    // version of this flow only logged inside a catch block reached by
    // thrown exceptions, so a normal (non-throwing) createUser() failure —
    // e.g. a disabled auth provider — left no server-side trace at all.
    console.error("[createCustomerAccount] auth.admin.createUser failed:", message);

    if (/duplicate|unique|already/i.test(message)) {
      return { error: "This phone number already has an account.", duplicatePhone: true };
    }
    return { error: "Couldn't create the customer account — please try again, or contact support if this keeps happening." };
  }

  return { customerId: data.user.id };
}
