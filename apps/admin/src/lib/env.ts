/**
 * Reads required Supabase env vars and fails loudly with a clear message if
 * they're missing, instead of letting the Supabase client fail later with a
 * confusing "invalid URL" error deep in a request. See README.md "Database
 * setup" for how to get these values (`npx supabase start`).
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill in your Supabase project's values — see README.md "Database setup".`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
};
