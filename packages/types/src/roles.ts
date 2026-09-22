/**
 * User roles shared by the admin dashboard and the mobile app.
 * Mirrors `public.user_role` in supabase/migrations/20240101000000_extensions_and_enums.sql —
 * keep both in sync if this changes.
 * Authorization must ALSO be enforced in Postgres via Row Level Security —
 * this type is for UI/UX branching only, never the source of truth for access control.
 */
export type UserRole =
  | "OWNER"
  | "MANAGER"
  | "STATION_MANAGER"
  | "EMPLOYEE"
  | "CUSTOMER";

export const USER_ROLES: readonly UserRole[] = [
  "OWNER",
  "MANAGER",
  "STATION_MANAGER",
  "EMPLOYEE",
  "CUSTOMER",
];

/**
 * Roles allowed into the admin dashboard (apps/admin) — matches the RLS
 * policies' `is_owner_or_manager()` / `is_station_staff()` staff notion.
 * EMPLOYEE and CUSTOMER use the mobile app instead. This is a UX gate
 * (redirect away, show a clear message); the real enforcement is still
 * each table's RLS policy.
 */
export const ADMIN_ROLES: readonly UserRole[] = ["OWNER", "MANAGER", "STATION_MANAGER"];

export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}

/**
 * Mirrors the DB's is_owner_or_manager() (see
 * supabase/migrations/20240101000070_auth_handlers.sql) — for a feature
 * that needs "all-station access" specifically, as opposed to a
 * station-scoped STATION_MANAGER (see is_station_manager_of() in
 * supabase/migrations/20240101000340_feedback_replies.sql for that case —
 * called via RPC rather than re-derived here, since it depends on which
 * station is involved). UI/UX gating only; RLS is still what actually
 * enforces it server-side.
 */
export function isOwnerOrManager(role: UserRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}
