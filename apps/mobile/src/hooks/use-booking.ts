import { useQuery } from "@tanstack/react-query";
import type { BookingStatus } from "@gas-station/types";
import { parseTimeRange } from "@gas-station/utils";
import { supabase } from "@/lib/supabase";

export interface BookingDetail {
  id: string;
  status: BookingStatus;
  start: string;
  end: string;
  stationNameEn: string;
  stationNameAr: string;
  serviceNameEn: string;
  serviceNameAr: string;
}

/**
 * One booking's confirmation/status detail. RLS (bookings_select,
 * supabase/migrations/20240101000130_rls_bookings.sql) allows this only
 * for the booking's own customer (owns_customer_row — the same anonymous
 * or later-verified session that created it) or station staff.
 */
export function useBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["booking", bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BookingDetail> => {
      if (!bookingId) throw new Error("missing bookingId");

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, station_id, station_service_id, time_range, status")
        .eq("id", bookingId)
        .single();
      if (bookingError || !booking) throw new Error(bookingError?.message ?? "Booking not found.");

      const [{ data: station }, { data: stationService }] = await Promise.all([
        supabase.from("stations").select("name_en, name_ar").eq("id", booking.station_id).single(),
        supabase.from("station_services").select("service_id").eq("id", booking.station_service_id).single(),
      ]);

      let serviceNameEn = "";
      let serviceNameAr = "";
      if (stationService?.service_id) {
        const { data: service } = await supabase
          .from("services")
          .select("name_en, name_ar")
          .eq("id", stationService.service_id)
          .single();
        serviceNameEn = service?.name_en ?? "";
        serviceNameAr = service?.name_ar ?? "";
      }

      const range = parseTimeRange(booking.time_range);

      return {
        id: booking.id,
        status: booking.status,
        start: range?.start ?? "",
        end: range?.end ?? "",
        stationNameEn: station?.name_en ?? "",
        stationNameAr: station?.name_ar ?? "",
        serviceNameEn,
        serviceNameAr,
      };
    },
  });
}
