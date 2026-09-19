export * from "./roles";
export * from "./database";

// database.ts is hand-written and scoped to what Phase 3 actually queries
// (see the comment at the top of that file) — it is NOT the full schema.
// Once Docker is available, run `pnpm db:types` to replace it with the real
// generated file (`supabase gen types typescript --local`), which needs a
// running Supabase instance and isn't available in this development
// environment.
