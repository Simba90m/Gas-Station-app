import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { RatingStars } from "../rating-stars";
import { ISSUE_CATEGORY_LABELS } from "../constants";
import { ReplyForm } from "./reply-form";

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

  const [
    { data: station },
    { data: stationService },
    { data: customer },
    { data: employee },
    { data: replies, error: repliesError },
    currentUser,
    { data: canReplyResult },
  ] = await Promise.all([
    supabase.from("stations").select("name_en").eq("id", feedback.station_id).single(),
    supabase.from("station_services").select("service_id").eq("id", feedback.station_service_id).single(),
    supabase.from("profiles").select("full_name, phone").eq("id", feedback.customer_id).single(),
    feedback.employee_id
      ? supabase.from("profiles").select("full_name").eq("id", feedback.employee_id).single()
      : Promise.resolve({ data: null }),
    // feedback_replies_select (supabase/migrations/20240101000340_feedback_replies.sql)
    // scopes this to the feedback's own customer or that station's staff —
    // same visibility as the feedback row itself.
    supabase
      .from("feedback_replies")
      .select("id, responded_by, message, created_at")
      .eq("feedback_id", feedback.id)
      .order("created_at", { ascending: true }),
    getCurrentUser(),
    // The same authoritative "who may reply" answer
    // feedback_replies_insert's RLS enforces (OWNER/MANAGER anywhere,
    // STATION_MANAGER only for their own assigned station) — called via
    // RPC rather than re-derived from currentUser.role here, so the UI
    // gate can't drift from what a submit would actually be allowed to do.
    supabase.rpc("is_station_manager_of", { p_station_id: feedback.station_id }),
  ]);

  const service = stationService
    ? (await supabase.from("services").select("name_en").eq("id", stationService.service_id).single()).data
    : null;

  const responderIds = [...new Set((replies ?? []).flatMap((r) => (r.responded_by ? [r.responded_by] : [])))];
  const { data: responders } =
    responderIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", responderIds)
      : { data: [] };
  const responderNameById = new Map((responders ?? []).map((p) => [p.id, p.full_name]));

  const canReply = !!currentUser && canReplyResult === true;

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

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Replies</h2>

        {repliesError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t load replies: {repliesError.message}
          </p>
        )}

        {!repliesError && (
          <ul className="mt-3 space-y-4">
            {(replies ?? []).map((reply) => (
              <li key={reply.id} className="rounded-md bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    Station Management{responderNameById.get(reply.responded_by ?? "") ? ` · ${responderNameById.get(reply.responded_by ?? "")}` : ""}
                  </span>
                  <span>{new Date(reply.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{reply.message}</p>
              </li>
            ))}
            {(!replies || replies.length === 0) && (
              <li className="text-sm text-slate-400">No replies yet.</li>
            )}
          </ul>
        )}

        {canReply && <ReplyForm feedbackId={feedback.id} />}
        {!canReply && currentUser && (
          <p className="mt-4 text-sm text-slate-400">
            Only an owner, manager, or this station&apos;s manager can reply to feedback.
          </p>
        )}
      </Card>
    </div>
  );
}
