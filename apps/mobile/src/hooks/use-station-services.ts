import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ServiceSelection } from "@/lib/journey-context";

/**
 * Services actually offered at one station — anon-readable
 * (station_services/services/queues RLS, all is_active-gated). Follows the
 * same "separate flat queries, joined client-side" pattern the admin
 * public join flow already uses (apps/admin/src/app/join/[token]/page.tsx)
 * rather than a Supabase embedded/nested select — this hand-written
 * Database type (packages/types/src/database.ts) declares no
 * Relationships, so embedded selects wouldn't type-check cleanly, and
 * flat + client-joined is already this codebase's established pattern.
 *
 * A service with children (a package GROUP, e.g. a future "Car Wash"
 * category with "Basic"/"Premium" options) is never itself bookable — see
 * get_available_slots()/create_booking() in
 * supabase/migrations/20240101000230_booking_engine.sql, which enforce the
 * same exclusion server-side. Filtered out here too, the same way the
 * admin join flow does, so a parent/category service never even appears
 * as a selectable option.
 *
 * Only category = 'BOOKABLE' services are offered here — Fuel (INFO) and
 * café/content items (CONTENT) are real catalog rows with their own
 * station availability, but never enter the booking/queue journey (the
 * customer app's Station → Service → Start Now/Book Later flow). See
 * supabase/migrations/20240101000300_service_category.sql, which also
 * enforces this server-side in get_available_slots()/create_booking()/
 * join_queue() so this filter is a UX convenience, not the only guard.
 */
export function useStationServices(stationId: string | undefined) {
  return useQuery({
    queryKey: ["station-services", stationId],
    enabled: Boolean(stationId),
    queryFn: async (): Promise<ServiceSelection[]> => {
      if (!stationId) return [];

      const [{ data: stationServices, error: ssError }, { data: services, error: svcError }, { data: queues, error: queuesError }] =
        await Promise.all([
          supabase.from("station_services").select("id, service_id").eq("station_id", stationId).eq("is_active", true),
          supabase
            .from("services")
            .select("id, name_en, name_ar, duration_minutes, parent_service_id")
            .eq("is_active", true)
            .eq("category", "BOOKABLE")
            .is("deleted_at", null),
          supabase.from("queues").select("id, station_service_id, is_open").eq("station_id", stationId),
        ]);

      if (ssError) throw ssError;
      if (svcError) throw svcError;
      if (queuesError) throw queuesError;

      const parentServiceIds = new Set(
        (services ?? []).flatMap((s) => (s.parent_service_id ? [s.parent_service_id] : [])),
      );
      const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
      const queueByStationServiceId = new Map((queues ?? []).map((q) => [q.station_service_id, q]));

      return (stationServices ?? []).flatMap((ss): ServiceSelection[] => {
        // Not currently offered as a real (non-deleted, active) catalog service.
        const service = serviceById.get(ss.service_id);
        if (!service) return [];
        // A package group — organizational only, never directly bookable.
        if (parentServiceIds.has(service.id)) return [];
        // A BOOKABLE row is guaranteed a duration by the database's own
        // services_bookable_requires_duration_check — the query above
        // already filters to category = 'BOOKABLE', so this never actually
        // trips; it just narrows the type instead of asserting past it.
        if (service.duration_minutes === null) return [];

        const queue = queueByStationServiceId.get(ss.id);

        return [
          {
            stationServiceId: ss.id,
            serviceId: service.id,
            nameEn: service.name_en,
            nameAr: service.name_ar,
            durationMinutes: service.duration_minutes,
            queueId: queue?.id ?? null,
            queueIsOpen: queue?.is_open ?? false,
          },
        ];
      });
    },
  });
}
