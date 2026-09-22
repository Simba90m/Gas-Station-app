import { createClient } from "@/lib/supabase/server";
import { FeedbackTable, type FeedbackRow, type StationOption } from "./feedback-table";

/**
 * feedback_select RLS (supabase/migrations/20240101000140_rls_feedback_complaints.sql)
 * already scopes this to what the signed-in staff member can see — their
 * own station(s), or every station for OWNER/MANAGER — same as bookings.
 * Flat queries + client-side joins, same convention as
 * get-dashboard-metrics.ts's getRecentActivity: this hand-written Database
 * type declares no Relationships, so an embedded select wouldn't type-check.
 */
export default async function FeedbackPage() {
  const supabase = await createClient();

  const [
    { data: feedback, error: feedbackError },
    { data: stations },
    { data: stationServices },
    { data: services },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from("feedback")
      .select("id, booking_id, customer_id, station_id, station_service_id, employee_id, rating, category, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("stations").select("id, name_en"),
    supabase.from("station_services").select("id, station_id, service_id"),
    supabase.from("services").select("id, name_en"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const stationNameById = new Map((stations ?? []).map((s) => [s.id, s.name_en]));
  const serviceIdByStationService = new Map((stationServices ?? []).map((ss) => [ss.id, ss.service_id]));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const feedbackRows: FeedbackRow[] = (feedback ?? []).map((f) => {
    const serviceId = serviceIdByStationService.get(f.station_service_id);
    return {
      id: f.id,
      customerName: profileNameById.get(f.customer_id) ?? "Unknown customer",
      stationName: stationNameById.get(f.station_id) ?? "Unknown station",
      serviceName: (serviceId && serviceNameById.get(serviceId)) ?? "Unknown service",
      employeeName: f.employee_id ? (profileNameById.get(f.employee_id) ?? "Unknown") : null,
      rating: f.rating,
      category: f.category,
      comment: f.comment,
      createdAt: f.created_at,
    };
  });

  const stationOptions: StationOption[] = (stations ?? []).map((s) => ({ id: s.id, nameEn: s.name_en }));

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-900">Feedback</h1>
      <p className="mt-1 text-sm text-slate-500">Customer feedback across all stations you have access to.</p>

      {feedbackError && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn&apos;t load feedback: {feedbackError.message}
        </p>
      )}

      {!feedbackError && <FeedbackTable feedback={feedbackRows} stations={stationOptions} />}
    </div>
  );
}
