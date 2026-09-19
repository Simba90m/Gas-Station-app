import { BUSINESS_TIMEZONE, getOperatingDayRange } from "@gas-station/utils";
import { createClient } from "@/lib/supabase/server";

export interface DashboardMetrics {
  totalStations: number | null;
  activeEmployees: number | null;
  todaysBookings: number | null;
  completedToday: number | null;
  openComplaints: number | null;
  activeOffers: number | null;
  queueSize: number | null;
  /** null = RLS returned no rows this user can see yet, not an error. */
  averageRating: number | null;
  /** Table names whose query actually failed (not just "zero rows") — surfaced so a real problem isn't silently shown as "0". */
  errors: string[];
}

/**
 * "Today" is the business's own operating day (Africa/Cairo calendar date),
 * not the server's — see docs/ARCHITECTURE.md "Operating day / late-night
 * bookings". Every count below is naturally scoped by Row Level Security to
 * whatever the logged-in user is allowed to see (e.g. a station manager's
 * "today's bookings" count already only includes their own station's
 * bookings — no extra filtering needed here).
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const { start, end } = getOperatingDayRange(new Date(), BUSINESS_TIMEZONE);
  const todayRange = `[${start.toISOString()},${end.toISOString()})`;
  const nowIso = new Date().toISOString();

  const [stations, employees, todaysBookings, completedToday, openComplaints, activeOffers, queueSize, feedback] =
    await Promise.all([
      supabase.from("stations").select("*", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("employees")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase.from("bookings").select("*", { count: "exact", head: true }).overlaps("time_range", todayRange),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .overlaps("time_range", todayRange)
        .eq("status", "COMPLETED"),
      supabase.from("complaints").select("*", { count: "exact", head: true }).not("status", "in", "(RESOLVED,CLOSED)"),
      supabase
        .from("offers")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso),
      supabase.from("queue_entries").select("*", { count: "exact", head: true }).in("status", ["WAITING", "CALLED"]),
      supabase.from("feedback").select("rating"),
    ]);

  const errors: string[] = [];
  const countOrNull = (label: string, result: { count: number | null; error: unknown }) => {
    if (result.error) {
      errors.push(label);
      return null;
    }
    return result.count ?? 0;
  };

  let averageRating: number | null = null;
  if (feedback.error) {
    errors.push("feedback");
  } else if (feedback.data.length > 0) {
    averageRating = feedback.data.reduce((sum, row) => sum + row.rating, 0) / feedback.data.length;
  }

  return {
    totalStations: countOrNull("stations", stations),
    activeEmployees: countOrNull("employees", employees),
    todaysBookings: countOrNull("bookings", todaysBookings),
    completedToday: countOrNull("bookings", completedToday),
    openComplaints: countOrNull("complaints", openComplaints),
    activeOffers: countOrNull("offers", activeOffers),
    queueSize: countOrNull("queue entries", queueSize),
    averageRating,
    errors,
  };
}
