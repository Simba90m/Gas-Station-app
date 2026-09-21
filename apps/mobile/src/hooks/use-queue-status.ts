import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ticketFromRow, type QueueTicket } from "@/types/queue-ticket";

/**
 * Live status for one queue entry — get_queue_ticket_status(), the
 * existing authenticated RPC that computes rank/estimated wait
 * server-side (supabase/migrations/20240101000270_customer_dual_channel_verification.sql).
 *
 * Realtime + polling, not realtime alone: queue_entries RLS only lets a
 * customer SELECT their OWN row (owns_customer_row), so a Realtime
 * subscription filtered to this entry's id fires the moment ITS status
 * changes (called/completed/etc.) — but rank/estimated wait also change
 * whenever a DIFFERENT customer ahead in the same queue is called or
 * completes, and RLS means this session is never notified of changes to
 * rows it can't read. The 15s refetchInterval is what catches those.
 * Realtime still matters here: it's what makes MY OWN status change
 * (called, in service, completed) show up immediately instead of waiting
 * up to 15s.
 */
export function useQueueStatus(entryId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["queue-status", entryId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(entryId),
    refetchInterval: 15_000,
    staleTime: 0,
    queryFn: async (): Promise<QueueTicket> => {
      if (!entryId) throw new Error("missing entryId");

      const { data, error } = await supabase.rpc("get_queue_ticket_status", { p_queue_entry_id: entryId });
      const row = data?.[0];
      if (error || !row) throw new Error(error?.message ?? "Couldn't load your ticket status.");

      return ticketFromRow(row);
    },
  });

  useEffect(() => {
    if (!entryId) return;

    const channel = supabase
      .channel(`queue-entry-${entryId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_entries", filter: `id=eq.${entryId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is derived from entryId, already a dep
  }, [entryId, queryClient]);

  return query;
}
