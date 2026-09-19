/**
 * Reads required Supabase env vars and fails loudly with a clear message if
 * they're missing, instead of letting the Supabase client fail later with a
 * confusing "invalid URL" error deep in a request. See README.md "Database
 * setup" for how to get these values (`npx supabase start`, or Settings →
 * API in a hosted Supabase project's dashboard).
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy apps/admin/.env.example to apps/admin/.env and fill in your Supabase project's values — see README.md "Database setup".`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  // Supabase's current terminology: the publishable key is the same kind of
  // key previously called the "anon key" — safe to ship in a browser bundle,
  // RLS is what actually restricts access. Named to match what the Supabase
  // dashboard now calls it and what the project's env vars provide.
  supabasePublishableKey: () =>
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
};
