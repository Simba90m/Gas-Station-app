/**
 * User roles shared by the admin dashboard and the mobile app.
 * Mirrors the `role` enum defined in the Supabase database (Phase 2).
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
