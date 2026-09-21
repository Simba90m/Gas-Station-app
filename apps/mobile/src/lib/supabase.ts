import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@gas-station/types";
import { env } from "./env";

/**
 * The one Supabase client for the mobile app — always the anon/publishable
 * key (never a service-role key; there is no server context here to hide
 * one in, so it must never exist client-side at all). AsyncStorage persists
 * the session (anonymous or, once phone/email verification lands, a real
 * one) across app restarts, same as apps/admin's browser client persists
 * via cookies.
 *
 * Constructed lazily (on first actual use, via the Proxy below), not at
 * module scope. supabase-js's GoTrue client tries to recover a persisted
 * session the moment createClient() runs — that touches AsyncStorage,
 * which on web reads `window.localStorage`. Expo Router's static web
 * export loads every route module on the server to prerender it (no
 * `window` there), and every screen imports a data hook that imports this
 * file — so an eagerly-created client crashed `expo export --platform web`
 * with "window is not defined" even though no query ever actually ran.
 * Every real call site (queryFn/mutationFn inside a hook, never a
 * component's render body) only runs client-side after hydration, so
 * deferring construction to first property access avoids the server pass
 * entirely without changing a single call site's `supabase.foo(...)`
 * syntax.
 */
let client: SupabaseClient<Database> | undefined;

function getClient(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});
