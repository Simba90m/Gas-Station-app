export * from "./roles";

// The database schema is now finalized (Phase 2 — see supabase/migrations/),
// but generating TypeScript types from it needs a running Supabase instance
// (`npx supabase gen types typescript --local`, which needs Docker — not
// available in this development environment). Run that command yourself
// once you have Docker running locally, and add the output here as
// database.ts, rather than hand-written domain types that could drift from
// the actual schema.
