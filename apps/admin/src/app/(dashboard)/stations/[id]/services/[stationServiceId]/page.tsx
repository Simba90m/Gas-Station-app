import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoursEditor } from "../../../hours-editor";
import { upsertServiceHoursAction } from "../actions";
import { PriceForm } from "./price-form";
import { ResourcesPanel } from "./resources-panel";
import { CategoryForm } from "./category-form";

export default async function StationServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string; stationServiceId: string }>;
}) {
  const { id: stationId, stationServiceId } = await params;
  const supabase = await createClient();

  const { data: stationService, error: stationServiceError } = await supabase
    .from("station_services")
    .select("id, station_id, service_id, price_override, is_active")
    .eq("id", stationServiceId)
    .eq("station_id", stationId)
    .single();

  if (stationServiceError || !stationService) {
    // Same "doesn't exist" vs. "no access" ambiguity as the station detail
    // page — RLS makes those indistinguishable from the outside, which is
    // the safe default.
    notFound();
  }

  const [{ data: station }, { data: service }, { data: hours }, { data: resources }] = await Promise.all([
    supabase.from("stations").select("name_en").eq("id", stationId).single(),
    supabase
      .from("services")
      .select("name_en, base_price, duration_minutes, requires_resource, category")
      .eq("id", stationService.service_id)
      .single(),
    supabase.from("service_operating_hours").select("*").eq("station_service_id", stationServiceId),
    supabase.from("service_resources").select("id, name_en, name_ar, status").eq("station_service_id", stationServiceId),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/stations/${stationId}`} className="text-sm font-medium text-slate-500 hover:underline">
          ← {station?.name_en ?? "Station"}
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">{service?.name_en ?? "Service"}</h1>
          <Badge tone={stationService.is_active ? "green" : "gray"}>
            {stationService.is_active ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Service type</h2>
        <p className="mt-1 text-sm text-slate-500">
          Whether customers can book or queue for this, or it&apos;s station info (e.g. Fuel) or café &amp; content
          (e.g. a menu item) instead. Changing this affects every station that offers this service, not just this
          one.
        </p>
        <div className="mt-4">
          <CategoryForm
            stationId={stationId}
            stationServiceId={stationServiceId}
            serviceId={stationService.service_id}
            category={service?.category ?? "BOOKABLE"}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Configuration</h2>
        <p className="mt-1 text-sm text-slate-500">
          Duration is set by the catalog service (
          {service?.duration_minutes !== null && service?.duration_minutes !== undefined
            ? `${service.duration_minutes} min`
            : "no duration — not a bookable service"}
          ) — only price can be overridden per station. Leave the price blank to use the catalog price (
          {service?.base_price ?? "—"} EGP).
        </p>
        <div className="mt-4">
          <PriceForm
            stationId={stationId}
            stationServiceId={stationServiceId}
            basePrice={service?.base_price ?? 0}
            priceOverride={stationService.price_override}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Operating hours</h2>
        <p className="mt-1 text-sm text-slate-500">
          When this service runs at this station — independent of the station&apos;s own hours and of any other
          station offering the same service (e.g. the station may be open 08:00 → 04:00 while this service only
          runs 10:00 → 03:00).
        </p>
        <div className="mt-4">
          <HoursEditor
            initialRows={hours ?? []}
            onSave={upsertServiceHoursAction.bind(null, stationId, stationServiceId)}
          />
        </div>
      </Card>

      {service?.requires_resource && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-900">Resources</h2>
          <p className="mt-1 text-sm text-slate-500">
            Bookable resources this service needs at this station (e.g. car wash bays) — add as many as this
            station actually has.
          </p>
          <div className="mt-4">
            <ResourcesPanel
              stationId={stationId}
              stationServiceId={stationServiceId}
              resources={(resources ?? []).map((r) => ({ id: r.id, nameEn: r.name_en, nameAr: r.name_ar, status: r.status }))}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
