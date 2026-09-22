"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { addFeedbackReplySchema } from "./schema";

export interface AddFeedbackReplyState {
  error?: string;
}

/**
 * The "OWNER/MANAGER anywhere, STATION_MANAGER only their own assigned
 * station(s), EMPLOYEE never" decision lives in exactly one place —
 * is_station_manager_of() (supabase/migrations/20240101000340_feedback_replies.sql)
 * — and is called here via RPC rather than reimplemented in TypeScript, so
 * this can't drift from what feedback_replies_insert's RLS actually
 * enforces. The feedback's own RLS (feedback_select) already hides a
 * station-unrelated STATION_MANAGER from seeing this row at all, so most
 * wrong-station attempts never even get this far.
 */
export async function addFeedbackReplyAction(feedbackId: string, message: string): Promise<AddFeedbackReplyState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to reply to feedback." };

  const supabase = await createClient();

  const { data: feedback, error: feedbackError } = await supabase
    .from("feedback")
    .select("station_id")
    .eq("id", feedbackId)
    .single();
  if (feedbackError || !feedback) return { error: "Couldn't find that feedback." };

  const { data: canReply, error: authError } = await supabase.rpc("is_station_manager_of", {
    p_station_id: feedback.station_id,
  });
  if (authError || !canReply) {
    return { error: "You don't have permission to reply to feedback for this station." };
  }

  const parsed = addFeedbackReplySchema.safeParse({ feedback_id: feedbackId, message });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your reply and try again." };
  }

  // responded_by is intentionally not sent — set_feedback_reply_responder()
  // (BEFORE INSERT trigger) always overwrites it with auth.uid().
  const { error } = await supabase
    .from("feedback_replies")
    .insert({ feedback_id: parsed.data.feedback_id, message: parsed.data.message });

  if (error) return { error: "Couldn't send the reply — please try again." };

  revalidatePath(`/feedback/${feedbackId}`);
  return {};
}
