import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@gas-station/types";
import { env } from "../env";

/**
 * Refreshes the Supabase auth session cookie on every request that matches
 * middleware.ts's matcher. This does NOT decide who's allowed to see what —
 * that's still enforced by Postgres RLS, and route access is separately
 * checked in the (dashboard) layout via a real getUser() call. This only
 * keeps the session cookie from expiring out from under a user mid-visit.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not add logic between createServerClient and getUser() — this call
  // is what actually revalidates/refreshes the session token.
  await supabase.auth.getUser();

  return supabaseResponse;
}
