import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  // The booking's OWN price, snapshotted at creation time by
  // create_booking()/_create_booking_core() (COALESCE(price_override,
  // base_price) — see supabase/migrations/20240101000230_booking_engine.sql
  // and .../20240101000300_service_category.sql). Reading it from here
  // rather than the live services/station_services catalog is what makes
  // it "historical" — if the owner changes a service's price later, every
  // existing booking still shows the price it actually cost.
  price: number;
}

/**
 * One booking's confirmation/status detail. RLS (bookings_select,
 * supabase/migrations/20240101000130_rls_bookings.sql) allows this only
 * for the booking's own customer (owns_customer_row — the same anonymous
 * or later-verified session that created it) or station staff.
 *
 * Realtime, no polling fallback needed: unlike useQueueStatus (which also
 * needs a refetchInterval because a queue's rank/wait time can change from
 * OTHER customers' rows this session's RLS hides), a booking has exactly
 * one row this session ever reads, and bookings_select already lets the
 * owner see it directly — a Realtime subscription on that one row's own
 * changes is sufficient to catch a staff-side status update (e.g. marked
 * COMPLETED) immediately.
 */
export function useBooking(bookingId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["booking", bookingId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BookingDetail> => {
      if (!bookingId) throw new Error("missing bookingId");

      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select("id, station_id, station_service_id, time_range, status, price")
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
        price: booking.price,
      };
    },
  });

  useEffect(() => {
    if (!bookingId) return;

    const channel = supabase
      .channel(`booking-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey is derived from bookingId, already a dep
  }, [bookingId, queryClient]);

  return query;
}
