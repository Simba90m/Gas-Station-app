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
  // Deliberately NOT prefixed with NEXT_PUBLIC_ — Next.js only inlines
  // NEXT_PUBLIC_* vars into the browser bundle, so this one is only ever
  // readable from server-side code (Server Actions, Route Handlers). Used
  // solely by lib/supabase/admin.ts, which is itself only ever imported
  // from "use server" files — see that file for why this is safe.
  supabaseServiceRoleKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  // Deliberately NOT prefixed with NEXT_PUBLIC_, even though it ends up
  // inside a URL a customer's phone visits after scanning the company-wide
  // QR code. It's not a page secret and isn't meant to stay hidden from
  // that visitor — it's a coarse "you're at one of our stations with our
  // real QR code" gate, checked against the /join/[token] route param
  // server-side, and rotatable here without a code change if a link is ever
  // leaked/abused for spam account creation. The actual security boundary
  // for the public self-service flow is per-phone-number account creation
  // that rejects (never silently reuses) an existing phone — see
  // apps/admin/src/app/join/[token]/actions.ts.
  qrJoinToken: () => requireEnv("QR_JOIN_TOKEN", process.env.QR_JOIN_TOKEN),
  // Optional — no requireEnv, since a real reverse proxy setting Host/
  // X-Forwarded-Proto correctly is a perfectly good fallback in production
  // (see app/(dashboard)/join-qr/page.tsx, which does that fallback). Exists
  // for the cases request headers get wrong: local LAN testing (the request
  // that renders this admin page arrives with Host: localhost:3000 even
  // though a phone on the network needs http://<lan-ip>:3000) and any
  // production deployment behind infra that doesn't forward the real host.
  // Set to a full origin with no trailing slash, e.g.
  // http://192.168.8.26:3000 for LAN testing or https://admin.example.com
  // in production. Not a secret — it's the same public URL the QR code
  // itself encodes — so no NEXT_PUBLIC_ prefix is needed; nothing client-side
  // reads it directly.
  joinBaseUrl: () => process.env.JOIN_BASE_URL || undefined,
};
