import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@gas-station/types";
import { env } from "../env";

/** Supabase client for use in Client Components. */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl(), env.supabaseAnonKey());
}
