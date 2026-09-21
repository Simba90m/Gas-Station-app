/**
 * Reads required Supabase env vars and fails loudly with a clear message if
 * they're missing, instead of letting the Supabase client fail later with a
 * confusing error deep in a request. Mirrors apps/admin/src/lib/env.ts's
 * pattern — Expo's equivalent of Next.js's NEXT_PUBLIC_ prefix is
 * EXPO_PUBLIC_, which Metro inlines into the app bundle at build time (see
 * apps/mobile/.env.example / root .env.example's "Supabase" section).
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy apps/mobile/.env.example to apps/mobile/.env and fill in your Supabase project's values — see README.md "Database setup".`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => requireEnv("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
};
