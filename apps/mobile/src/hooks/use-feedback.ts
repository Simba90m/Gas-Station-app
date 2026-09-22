import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueCategory } from "@gas-station/types";
import { supabase } from "@/lib/supabase";
import { ensureCustomerSession } from "@/lib/session";

export interface FeedbackDetail {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

// A customer only ever rates the one BOOKABLE thing they just did — no
// category picker in this lightweight flow (see feedback-form.tsx). The
// schema's issue_category column still needs a value; complaints (a
// separate, unbuilt feature) are where a customer would actually pick a
// specific category for a real issue.
const DEFAULT_FEEDBACK_CATEGORY: IssueCategory = "OTHER";

/**
 * At most one feedback row per booking (feedback.booking_id is UNIQUE — see
 * supabase/migrations/20240101000080_feedback_and_complaints.sql). Fetched
 * first so the completion screen can show the submission form OR the
 * already-submitted feedback + replies, never both.
 */
export function useFeedback(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["feedback", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<FeedbackDetail | null> => {
      if (!bookingId) throw new Error("missing bookingId");

      const { data, error } = await supabase
        .from("feedback")
        .select("id, rating, comment, created_at")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;

      return { id: data.id, rating: data.rating, comment: data.comment, createdAt: data.created_at };
    },
  });
}

export interface FeedbackReply {
  id: string;
  message: string;
  createdAt: string;
}

/**
 * feedback_replies_select (supabase/migrations/20240101000340_feedback_replies.sql)
 * lets the feedback's own customer read these. Every reply is shown as
 * "Station Management" — RLS doesn't expose the individual staff member's
 * profile to the customer (profiles has no such policy), which also keeps
 * this the collective "the business responded" framing the brief asks for,
 * not an individual employee's name.
 */
export function useFeedbackReplies(feedbackId: string | undefined) {
  return useQuery({
    queryKey: ["feedback-replies", feedbackId],
    enabled: Boolean(feedbackId),
    queryFn: async (): Promise<FeedbackReply[]> => {
      if (!feedbackId) throw new Error("missing feedbackId");

      const { data, error } = await supabase
        .from("feedback_replies")
        .select("id, message, created_at")
        .eq("feedback_id", feedbackId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      return (data ?? []).map((r) => ({ id: r.id, message: r.message, createdAt: r.created_at }));
    },
  });
}

export interface MyFeedbackEntry {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  stationNameEn: string;
  stationNameAr: string;
  serviceNameEn: string;
  serviceNameAr: string;
}

/**
 * Every feedback row the CURRENT session's customer has ever submitted,
 * across all their bookings — the "My Feedback" screen's data source. RLS
 * (feedback_select's owns_customer_row branch) already scopes this to
 * exactly their own rows, same as useFeedback() above; no customer_id
 * filter needed here either. Deliberately does NOT call
 * ensureCustomerSession() — that creates a session as a side effect, which
 * lib/session.ts documents as only ever happening right before a real
 * write (join/book), never just to look. A session-less visitor here
 * simply has no feedback yet, which is a normal empty state, not an error.
 */
export function useMyFeedback() {
  return useQuery({
    queryKey: ["my-feedback"],
    queryFn: async (): Promise<MyFeedbackEntry[]> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return [];

      const { data: feedback, error } = await supabase
        .from("feedback")
        .select("id, station_id, station_service_id, rating, comment, created_at")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      if (!feedback || feedback.length === 0) return [];

      const stationIds = [...new Set(feedback.map((f) => f.station_id))];
      const stationServiceIds = [...new Set(feedback.map((f) => f.station_service_id))];

      const [{ data: stations }, { data: stationServices }] = await Promise.all([
        supabase.from("stations").select("id, name_en, name_ar").in("id", stationIds),
        supabase.from("station_services").select("id, service_id").in("id", stationServiceIds),
      ]);

      const serviceIds = [...new Set((stationServices ?? []).map((ss) => ss.service_id))];
      const { data: services } = await supabase.from("services").select("id, name_en, name_ar").in("id", serviceIds);

      const stationById = new Map((stations ?? []).map((s) => [s.id, s]));
      const serviceIdByStationService = new Map((stationServices ?? []).map((ss) => [ss.id, ss.service_id]));
      const serviceById = new Map((services ?? []).map((s) => [s.id, s]));

      return feedback.map((f) => {
        const station = stationById.get(f.station_id);
        const serviceId = serviceIdByStationService.get(f.station_service_id);
        const service = serviceId ? serviceById.get(serviceId) : undefined;
        return {
          id: f.id,
          rating: f.rating,
          comment: f.comment,
          createdAt: f.created_at,
          stationNameEn: station?.name_en ?? "",
          stationNameAr: station?.name_ar ?? "",
          serviceNameEn: service?.name_en ?? "",
          serviceNameAr: service?.name_ar ?? "",
        };
      });
    },
  });
}

/**
 * All replies across a SET of feedback ids in one query (grouped
 * client-side), rather than one useFeedbackReplies() call per list item —
 * hooks can't be called in a loop, and this is also just one round trip
 * for a "My Feedback" list instead of N.
 */
export function useFeedbackRepliesFor(feedbackIds: string[]) {
  const key = feedbackIds.slice().sort().join(",");

  return useQuery({
    queryKey: ["feedback-replies-for", key],
    enabled: feedbackIds.length > 0,
    queryFn: async (): Promise<Map<string, FeedbackReply[]>> => {
      const { data, error } = await supabase
        .from("feedback_replies")
        .select("id, feedback_id, message, created_at")
        .in("feedback_id", feedbackIds)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      const byFeedbackId = new Map<string, FeedbackReply[]>();
      for (const r of data ?? []) {
        const list = byFeedbackId.get(r.feedback_id) ?? [];
        list.push({ id: r.id, message: r.message, createdAt: r.created_at });
        byFeedbackId.set(r.feedback_id, list);
      }
      return byFeedbackId;
    },
  });
}

export interface SubmitFeedbackInput {
  bookingId: string;
  rating: number;
  comment: string | null;
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, rating, comment }: SubmitFeedbackInput): Promise<FeedbackDetail> => {
      const session = await ensureCustomerSession();
      if ("error" in session) throw new Error(session.error);

      // customer_id/station_id/station_service_id are required by the
      // Insert type (they're NOT NULL columns with no DB default) but are
      // actually overwritten by populate_feedback_from_booking (BEFORE
      // INSERT, from the booking itself) before the row is ever checked or
      // stored — see supabase/migrations/20240101000080_feedback_and_complaints.sql
      // and packages/types/src/database.ts's Insert comment on `feedback`.
      // Reading the booking's real values here (rather than placeholders)
      // keeps this insert meaningful even if that trigger's behavior ever
      // changes, and RLS's WITH CHECK still only evaluates the final,
      // trigger-derived row either way.
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("customer_id, station_id, station_service_id")
        .eq("id", bookingId)
        .single();
      if (bookingError || !booking) throw new Error(bookingError?.message ?? "Couldn't find that booking.");

      const { data, error } = await supabase
        .from("feedback")
        .insert({
          booking_id: bookingId,
          customer_id: booking.customer_id,
          station_id: booking.station_id,
          station_service_id: booking.station_service_id,
          rating,
          category: DEFAULT_FEEDBACK_CATEGORY,
          comment,
        })
        .select("id, rating, comment, created_at")
        .single();

      if (data) return { id: data.id, rating: data.rating, comment: data.comment, createdAt: data.created_at };

      // 23505 = unique_violation on feedback_booking_id_key. This insert
      // can genuinely be a RETRY: the first submission may have already
      // committed server-side while its response was lost (dropped
      // connection, backgrounded app, timeout) — the client has no way to
      // tell "rejected" apart from "succeeded but I never heard back"
      // except by asking the server what's actually there. Recovering into
      // the existing row (rather than surfacing a dead-end error the
      // customer can never get past) is the whole point of this branch —
      // the UNIQUE constraint itself is untouched and still the only thing
      // that actually prevents a second row.
      if (error?.code === "23505") {
        const { data: existing, error: fetchError } = await supabase
          .from("feedback")
          .select("id, rating, comment, created_at")
          .eq("booking_id", bookingId)
          .single();
        if (fetchError || !existing) {
          throw new Error(fetchError?.message ?? "Couldn't submit your feedback.");
        }
        return { id: existing.id, rating: existing.rating, comment: existing.comment, createdAt: existing.created_at };
      }

      throw new Error(error?.message ?? "Couldn't submit your feedback.");
    },
    onSuccess: (feedback, variables) => {
      queryClient.setQueryData(["feedback", variables.bookingId], feedback);
    },
  });
}
