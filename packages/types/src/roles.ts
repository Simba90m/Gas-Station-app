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
