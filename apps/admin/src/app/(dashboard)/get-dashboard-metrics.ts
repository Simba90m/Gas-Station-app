import { BUSINESS_TIMEZONE, getOperatingDayRange } from "@gas-station/utils";
import type { BookingStatus } from "@gas-station/types";
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

  // Count-only queries select "id" rather than "*": complaints.internal_notes
  // is deliberately not SELECT-granted to `authenticated` (see
  // supabase/migrations/20240101000080_feedback_and_complaints.sql) to keep
  // it out of customers' reach, and Postgres checks column privileges for
  // the whole row before RLS even runs — so `select("*", ...)` against
  // complaints always fails with a permission error, for every role, with
  // or without any rows. "id" is selectable on every table here and is all
  // a head/count request actually needs.
  const [stations, employees, todaysBookings, completedToday, openComplaints, activeOffers, queueSize, feedback] =
    await Promise.all([
      supabase.from("stations").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .is("deleted_at", null),
      supabase.from("bookings").select("id", { count: "exact", head: true }).overlaps("time_range", todayRange),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .overlaps("time_range", todayRange)
        .eq("status", "COMPLETED"),
      supabase.from("complaints").select("id", { count: "exact", head: true }).not("status", "in", "(RESOLVED,CLOSED)"),
      supabase
        .from("offers")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso),
      supabase.from("queue_entries").select("id", { count: "exact", head: true }).in("status", ["WAITING", "CALLED"]),
      supabase.from("feedback").select("rating"),
    ]);

  const errors: string[] = [];
  const countOrNull = (label: string, result: { count: number | null; error: object | null }) => {
    if (result.error) {
      errors.push(label);
      // Logged server-side only (this runs in a Server Component) so the
      // real Postgres/PostgREST reason is diagnosable without guessing —
      // the UI still just says "Couldn't load: <label>", never the raw error.
      // Dumping every own property (not just .message) matters here: a
      // PostgrestError parsed from an empty response body (which is what a
      // failed head:true/HEAD request gets — HTTP HEAD responses have no
      // body to carry the JSON error details PostgREST would normally send)
      // can have an empty .message while still carrying a real .code.
      console.error(`[dashboard metrics] ${label}:`, JSON.stringify(result.error, Object.getOwnPropertyNames(result.error)));
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

export interface RecentActivityItem {
  id: string;
  bookingId: string;
  status: BookingStatus;
  changedAt: string;
  customerName: string;
  stationName: string;
  serviceName: string;
}

const RECENT_ACTIVITY_LIMIT = 8;

/**
 * booking_status_history (supabase/migrations/20240101000050_bookings.sql)
 * is populated automatically by record_booking_status_change() every time a
 * booking's status changes — a ready-made activity log, not new schema.
 * booking_status_history_select RLS
 * (supabase/migrations/20240101000130_rls_bookings.sql) scopes it to
 * exactly the same bookings this viewer can already see (their own
 * station(s), or everything for OWNER/MANAGER), so no extra filtering is
 * needed here. Flat queries + client-side joins, same convention as
 * bookings/page.tsx — this hand-written Database type declares no
 * Relationships, so an embedded select wouldn't type-check cleanly.
 */
export async function getRecentActivity(): Promise<RecentActivityItem[]> {
  const supabase = await createClient();

  const { data: history } = await supabase
    .from("booking_status_history")
    .select("id, booking_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(RECENT_ACTIVITY_LIMIT);

  if (!history || history.length === 0) return [];

  const bookingIds = [...new Set(history.map((h) => h.booking_id))];
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, customer_id, station_id, station_service_id")
    .in("id", bookingIds);

  const stationServiceIds = [...new Set((bookings ?? []).map((b) => b.station_service_id))];
  const customerIds = [...new Set((bookings ?? []).map((b) => b.customer_id))];
  const stationIds = [...new Set((bookings ?? []).map((b) => b.station_id))];

  const [{ data: stationServices }, { data: profiles }, { data: stations2 }] = await Promise.all([
    supabase.from("station_services").select("id, service_id").in("id", stationServiceIds),
    supabase.from("profiles").select("id, full_name").in("id", customerIds),
    supabase.from("stations").select("id, name_en").in("id", stationIds),
  ]);

  const serviceIds = [...new Set((stationServices ?? []).map((ss) => ss.service_id))];
  const { data: services } = await supabase.from("services").select("id, name_en").in("id", serviceIds);

  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));
  const serviceIdByStationService = new Map((stationServices ?? []).map((ss) => [ss.id, ss.service_id]));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const stationNameById = new Map((stations2 ?? []).map((s) => [s.id, s.name_en]));

  return history.flatMap((h): RecentActivityItem[] => {
    const booking = bookingById.get(h.booking_id);
    if (!booking) return []; // RLS hid the booking itself (shouldn't happen given the policy above, but never show an orphaned row)

    const serviceId = serviceIdByStationService.get(booking.station_service_id);
    return [
      {
        id: h.id,
        bookingId: h.booking_id,
        status: h.status,
        changedAt: h.created_at,
        customerName: profileNameById.get(booking.customer_id) ?? "Unknown customer",
        stationName: stationNameById.get(booking.station_id) ?? "Unknown station",
        serviceName: (serviceId && serviceNameById.get(serviceId)) ?? "Unknown service",
      },
    ];
  });
}
