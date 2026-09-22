import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { RatingStars } from "../rating-stars";
import { ISSUE_CATEGORY_LABELS } from "../constants";

export default async function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: feedback, error: feedbackError } = await supabase
    .from("feedback")
    .select("id, booking_id, customer_id, station_id, station_service_id, employee_id, rating, category, comment, created_at")
    .eq("id", id)
    .single();

  // "Doesn't exist" and "you don't have access" are indistinguishable from
  // the outside under RLS — the same safe default the bookings/employees
  // modules already use.
  if (feedbackError || !feedback) notFound();

  const [{ data: station }, { data: stationService }, { data: customer }, { data: employee }] = await Promise.all([
    supabase.from("stations").select("name_en").eq("id", feedback.station_id).single(),
    supabase.from("station_services").select("service_id").eq("id", feedback.station_service_id).single(),
    supabase.from("profiles").select("full_name, phone").eq("id", feedback.customer_id).single(),
    feedback.employee_id
      ? supabase.from("profiles").select("full_name").eq("id", feedback.employee_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const service = stationService
    ? (await supabase.from("services").select("name_en").eq("id", stationService.service_id).single()).data
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Feedback</h1>
        <p className="mt-1 text-sm text-slate-500">
          {station?.name_en ?? "Unknown station"} · {service?.name_en ?? "Unknown service"}
        </p>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <RatingStars rating={feedback.rating} className="text-base" />
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {ISSUE_CATEGORY_LABELS[feedback.category]}
          </span>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-900">{feedback.comment ?? "No comment left."}</p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-slate-500">Date</dt>
          <dd className="text-slate-900">{new Date(feedback.created_at).toLocaleString()}</dd>
          <dt className="text-slate-500">Customer</dt>
          <dd className="text-slate-900">
            {customer?.full_name ?? "Unknown"} {customer?.phone ? `(${customer.phone})` : ""}
          </dd>
          <dt className="text-slate-500">Station</dt>
          <dd className="text-slate-900">{station?.name_en ?? "Unknown"}</dd>
          <dt className="text-slate-500">Service</dt>
          <dd className="text-slate-900">{service?.name_en ?? "Unknown"}</dd>
          <dt className="text-slate-500">Employee</dt>
          <dd className="text-slate-900">{employee?.full_name ?? "—"}</dd>
          <dt className="text-slate-500">Booking</dt>
          <dd className="text-slate-900">
            <Link href={`/bookings/${feedback.booking_id}`} className="font-medium text-slate-700 hover:underline">
              View booking
            </Link>
          </dd>
        </dl>
      </Card>
    </div>
  );
}
