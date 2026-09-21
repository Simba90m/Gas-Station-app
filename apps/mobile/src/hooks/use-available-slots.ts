import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface AvailableSlot {
  start: string;
  end: string;
}

/**
 * Available booking slots for one station/service/date — reads
 * get_available_slots(), the existing SECURITY DEFINER RPC
 * (supabase/migrations/20240101000230_booking_engine.sql). Availability is
 * never computed client-side; this is the only source of truth for what
 * "available" means. staleTime: 0 overrides the app-wide default (see
 * lib/query-client.ts) — this must always reflect the live backend, never
 * a cached answer from a moment ago.
 */
export function useAvailableSlots(stationId: string | undefined, serviceId: string | undefined, date: string) {
  return useQuery({
    queryKey: ["available-slots", stationId, serviceId, date],
    enabled: Boolean(stationId && serviceId && date),
    staleTime: 0,
    queryFn: async (): Promise<AvailableSlot[]> => {
      if (!stationId || !serviceId) return [];

      const { data, error } = await supabase.rpc("get_available_slots", {
        p_station_id: stationId,
        p_service_id: serviceId,
        p_date: date,
      });

      if (error) throw error;
      return (data ?? []).map((row) => ({ start: row.slot_start, end: row.slot_end }));
    },
  });
}
