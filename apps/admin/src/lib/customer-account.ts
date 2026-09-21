import "server-only";
import { createAdminClient } from "./supabase/admin";

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
 * supabase/migrations/20240101000070_auth_handlers.sql). Used by the
 * admin-staff-driven flow ((dashboard)/bookings/actions.ts
 * createCustomerAction) — a staff member is physically present with the
 * customer, so this creates the account directly with phone_confirm: true
 * rather than sending an OTP; no email is collected here.
 *
 * The public QR kiosk flow (join/[token]/actions.ts) no longer calls this
 * — a public/anonymous kiosk visitor has no staff member vouching for them
 * in person, so their account is created (and both phone and email
 * verified) through real OTP verification instead
 * (supabase.auth.signInWithOtp/verifyOtp), which also establishes their
 * own session — see
 * supabase/migrations/20240101000270_customer_dual_channel_verification.sql.
 *
 * Requires the Phone auth provider to be configured with a real SMS
 * vendor (Twilio — see README.md "Phone/email OTP") even though no OTP is
 * actually sent here: `phone_confirm: true` skips SENDING one, but the
 * provider still needs to be enabled for phone-based account creation to
 * work at all. Previously this used a synthetic, never-shown
 * ".invalid"-domain email + throwaway password instead, specifically to
 * avoid that dependency (see git history) — now that the provider is
 * required anyway for the public flow's phone OTP, that workaround is
 * unnecessary for this call site too.
 *
 * Duplicate phones are caught for real by profiles_phone_unique_idx (see
 * supabase/migrations/20240101000260_global_phone_and_kiosk.sql) — callers
 * should still check for an existing customer by phone first where
 * practical; this is the safety net for the rare simultaneous-creation
 * race, not the primary duplicate-prevention path.
 */
export async function createCustomerAccount(input: CreateCustomerAccountInput): Promise<CreateCustomerAccountResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    phone: input.phone,
    phone_confirm: true,
    user_metadata: { full_name: input.fullName, phone: input.phone },
  });

  if (error || !data.user) {
    const message = error?.message ?? "unknown error";
    console.error("[createCustomerAccount] auth.admin.createUser failed:", message);

    if (/duplicate|unique|already/i.test(message)) {
      return { error: "This phone number already has an account.", duplicatePhone: true };
    }
    return { error: "Couldn't create the customer account — please try again, or contact support if this keeps happening." };
  }

  return { customerId: data.user.id };
}
