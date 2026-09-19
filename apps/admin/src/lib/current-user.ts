import { isAdminRole, type UserRole } from "@gas-station/types";
import { createClient } from "./supabase/server";

export interface CurrentUser {
  id: string;
  fullName: string;
  role: UserRole;
}

/**
 * The logged-in user's profile, or null if nobody's logged in / their
 * profile can't be read. Does NOT check whether the role is admin-eligible
 * — use requireAdminUser() for that in a page/layout that must be
 * protected.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return { id: profile.id, fullName: profile.full_name, role: profile.role };
}

/** Same as getCurrentUser(), but null unless the role is admin-eligible. */
export async function getCurrentAdminUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  if (!user || !isAdminRole(user.role)) return null;
  return user;
}
