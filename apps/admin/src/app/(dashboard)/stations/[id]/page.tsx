import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateStationAction, upsertStationHoursAction } from "../actions";
import { StationForm } from "../station-form";
import { HoursEditor } from "../hours-editor";
import { ActivateToggle } from "../activate-toggle";
import { ServicesPanel } from "./services/services-panel";

export default async function StationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: station, error: stationError }, { data: hours }, { data: stationServices }, { data: catalog }] =
    await Promise.all([
      supabase.from("stations").select("*").eq("id", id).single(),
      supabase.from("station_operating_hours").select("*").eq("station_id", id),
      supabase.from("station_services").select("id, service_id, price_override, is_active").eq("station_id", id),
      supabase.from("services").select("id, name_en, base_price, duration_minutes").eq("is_active", true).is("deleted_at", null),
    ]);

  if (stationError || !station) {
    // Could be "doesn't exist" or "you don't have access" — RLS makes
    // those indistinguishable from the outside, which is the correct,
    // safe default (it doesn't confirm a station exists that this viewer
    // otherwise has no access to).
    notFound();
  }

  const catalogById = new Map((catalog ?? []).map((service) => [service.id, service]));
  const enabledServiceIds = new Set((stationServices ?? []).map((ss) => ss.service_id));
  const enabledServices = (stationServices ?? []).flatMap((ss) => {
    const service = catalogById.get(ss.service_id);
    if (!service) return []; // catalog service is inactive/deleted/not visible to this viewer — nothing sane to show
    return [
      {
        stationServiceId: ss.id,
        nameEn: service.name_en,
        basePrice: service.base_price,
        priceOverride: ss.price_override,
        durationMinutes: service.duration_minutes,
        isActive: ss.is_active,
      },
    ];
  });
  const availableServices = (catalog ?? [])
    .filter((service) => !enabledServiceIds.has(service.id))
    .map((service) => ({ id: service.id, nameEn: service.name_en }));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{station.name_en}</h1>
          <div className="mt-1">
            <Badge tone={station.is_active ? "green" : "gray"}>{station.is_active ? "Active" : "Inactive"}</Badge>
          </div>
        </div>
        <ActivateToggle stationId={station.id} isActive={station.is_active} />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Station details</h2>
        <div className="mt-4">
          <StationForm
            action={updateStationAction}
            submitLabel="Save changes"
            stationId={station.id}
            defaultValues={{
              name_en: station.name_en,
              name_ar: station.name_ar,
              address_en: station.address_en,
              address_ar: station.address_ar,
              latitude: station.latitude,
              longitude: station.longitude,
              phone: station.phone,
              description_en: station.description_en,
              description_ar: station.description_ar,
            }}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Operating hours</h2>
        <p className="mt-1 text-sm text-slate-500">
          When this station itself is open. Individual services (car wash, café, ...) keep their own, independent
          hours — set per service below.
        </p>
        <div className="mt-4">
          <HoursEditor initialRows={hours ?? []} onSave={(rows) => upsertStationHoursAction(station.id, rows)} />
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Services</h2>
        <p className="mt-1 text-sm text-slate-500">
          Which of the catalog services this station offers, and at what price. Enabling a service here never
          duplicates it — it stays one shared catalog entry, offered by whichever stations choose to.
        </p>
        <div className="mt-4">
          <ServicesPanel stationId={station.id} enabled={enabledServices} available={availableServices} />
        </div>
      </Card>
    </div>
  );
}
