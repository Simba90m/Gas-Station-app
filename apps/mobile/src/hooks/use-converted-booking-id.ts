import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * A completed walk-in queue entry has a linked booking — created by
 * start_queue_service() when service began, recorded on
 * queue_entries.converted_booking_id (see
 * supabase/migrations/20240101000250_queue_booking_bridge.sql) — which is
 * where the actual price lives (queue_entries itself has no price column).
 * queue_entries_select RLS (supabase/migrations/20240101000130_rls_bookings.sql)
 * already lets the entry's own customer read this column directly, same as
 * every other field get_queue_ticket_status() surfaces.
 *
 * Only enabled once the caller knows the entry is COMPLETED — there's
 * nothing to look up before then, and no point re-querying on every status
 * tick while still waiting/in service.
 */
export function useConvertedBookingId(entryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["queue-entry-converted-booking", entryId],
    enabled: Boolean(entryId) && enabled,
    queryFn: async (): Promise<string | null> => {
      if (!entryId) throw new Error("missing entryId");

      const { data, error } = await supabase
        .from("queue_entries")
        .select("converted_booking_id")
        .eq("id", entryId)
        .single();
      if (error) throw new Error(error.message);

      return data?.converted_booking_id ?? null;
    },
  });
}
