import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@gas-station/types";
import { env } from "../env";

/**
 * Supabase client authenticated as the service role — bypasses RLS
 * entirely and can call the Auth Admin API (auth.admin.createUser, etc).
 *
 * SECURITY: the `import "server-only"` above makes any accidental import
 * of this file from a Client Component a BUILD ERROR, not just a runtime
 * mistake — the service role key can never end up in a browser bundle.
 * Only import this from a "use server" file, and always apply your own
 * authorization check first (getCurrentAdminUser() or equivalent) — this
 * client has no notion of "who's asking," unlike the regular
 * lib/supabase/server.ts client, which is scoped to the signed-in user's
 * session and RLS. It exists for exactly one purpose right now: creating a
 * real auth.users account for a walk-in customer during manual booking
 * creation (see bookings/actions.ts createCustomerAction) — the one
 * operation in this app that a plain `authenticated` session structurally
 * cannot do (auth.users is not writable via the normal client, by design —
 * see supabase/migrations/ for how every other trusted operation in this
 * schema goes through SECURITY DEFINER Postgres functions instead; this is
 * the one exception, imposed by Supabase's own architecture, since only
 * the Auth Admin API can create a real account).
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
