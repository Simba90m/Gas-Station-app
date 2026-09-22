"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { addFeedbackReplyAction } from "./actions";

/** Owner/manager-only reply composer — server-gated in actions.ts, but this
 * component is itself only ever rendered for an owner/manager (see
 * page.tsx), same as bookings/[id]/status-actions.tsx not re-checking role. */
export function ReplyForm({ feedbackId }: { feedbackId: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setError(undefined);
    setSuccess(false);
    startTransition(async () => {
      const result = await addFeedbackReplyAction(feedbackId, message);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("");
      setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <Label htmlFor="reply_message">Reply as Station Management</Label>
      <textarea
        id="reply_message"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setSuccess(false);
        }}
        rows={3}
        placeholder="Write a reply to this feedback..."
        disabled={isPending}
        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:bg-slate-100 disabled:text-slate-500"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" disabled={isPending || !message.trim()}>
          {isPending ? "Sending..." : "Send reply"}
        </Button>
        {success && <span className="text-sm text-green-700">Reply sent.</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
