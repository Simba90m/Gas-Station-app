import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ensureCustomerSession } from "@/lib/session";
import { ticketFromRow, type QueueTicket } from "@/types/queue-ticket";

/**
 * "Start Now": joins the walk-in queue via join_queue(), the existing
 * authenticated RPC (owns_customer_row() authorizes it once the customer
 * has a real — possibly anonymous — session; see lib/session.ts). No
 * queue logic is duplicated here — position assignment, the "already has
 * an active entry" check, everything lives in the one place it always
 * has: supabase/migrations/20240101000250_queue_booking_bridge.sql.
 */
export function useJoinQueue() {
  return useMutation({
    mutationFn: async (stationServiceId: string): Promise<QueueTicket> => {
      const session = await ensureCustomerSession();
      if ("error" in session) throw new Error(session.error);

      const { data: entry, error: joinError } = await supabase.rpc("join_queue", {
        p_customer_id: session.userId,
        p_station_service_id: stationServiceId,
      });
      if (joinError || !entry) throw new Error(joinError?.message ?? "Couldn't join the queue.");

      const { data: status, error: statusError } = await supabase.rpc("get_queue_ticket_status", {
        p_queue_entry_id: entry.id,
      });
      const row = status?.[0];
      if (statusError || !row) throw new Error(statusError?.message ?? "Joined the queue, but couldn't load your ticket.");

      return ticketFromRow(row);
    },
  });
}
