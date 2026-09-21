import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ensureCustomerSession } from "@/lib/session";

export interface CreateBookingInput {
  stationId: string;
  serviceId: string;
  startAt: string;
}

/**
 * "Book for Later": creates a real booking via create_booking(), the
 * existing authenticated RPC — same availability/conflict logic
 * (get_available_slots, the EXCLUDE constraints) every other caller
 * already goes through. Employee selection stays optional (p_employee_id
 * omitted here) unless a service requires one, which create_booking()
 * itself already enforces — nothing duplicated client-side.
 */
export function useCreateBooking() {
  return useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<{ bookingId: string }> => {
      const session = await ensureCustomerSession();
      if ("error" in session) throw new Error(session.error);

      const { data, error } = await supabase.rpc("create_booking", {
        p_customer_id: session.userId,
        p_station_id: input.stationId,
        p_service_id: input.serviceId,
        p_start_at: input.startAt,
      });

      if (error || !data) throw new Error(error?.message ?? "Couldn't create the booking.");
      return { bookingId: data.id };
    },
  });
}
