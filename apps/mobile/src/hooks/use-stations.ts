import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { StationSelection } from "@/lib/journey-context";

/**
 * Active stations, anon-readable (supabase/migrations/20240101000120_rls_catalog.sql
 * stations_select policy) — no session needed. Never hardcoded: whatever
 * stations exist in the database is what shows here.
 */
export function useStations() {
  return useQuery({
    queryKey: ["stations"],
    queryFn: async (): Promise<StationSelection[]> => {
      const { data, error } = await supabase
        .from("stations")
        .select("id, name_en, name_ar, address_en, address_ar")
        .eq("is_active", true)
        .order("name_en");

      if (error) throw error;

      return (data ?? []).map((s) => ({
        id: s.id,
        nameEn: s.name_en,
        nameAr: s.name_ar,
        addressEn: s.address_en,
        addressAr: s.address_ar,
      }));
    },
  });
}
