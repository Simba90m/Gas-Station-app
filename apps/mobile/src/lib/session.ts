import { supabase } from "./supabase";

/**
 * Ensures the current customer has a real Supabase Auth session before a
 * write that requires one (join_queue()/create_booking() — both check
 * owns_customer_row(), i.e. auth.uid() = p_customer_id). Called lazily,
 * right before "Join the queue" / "Confirm booking" — never on app boot —
 * so an anonymous session only ever gets created for someone actually
 * about to use it (see supabase/config.toml's enable_anonymous_sign_ins
 * for the full reasoning).
 *
 * If a session already exists (anonymous from an earlier action in this
 * same app install, or later a real phone/email-verified one once that
 * lands for mobile), it's reused as-is — this never creates a second
 * identity for someone who already has one, and an anonymous session is
 * designed to be upgraded in place later via supabase.auth.updateUser(),
 * not replaced.
 */
export async function ensureCustomerSession(): Promise<{ userId: string } | { error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return { userId: session.user.id };

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session?.user) {
    console.error("[ensureCustomerSession] signInAnonymously failed:", error?.message);
    return { error: "Couldn't start your session — please check your connection and try again." };
  }
  return { userId: data.session.user.id };
}
