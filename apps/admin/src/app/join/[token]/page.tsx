import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { JoinFlow } from "./join-flow";
import type { PublicServiceOption, PublicStationOption } from "./actions";

function tokenMatches(token: string): boolean {
  let expectedRaw: string;
  try {
    expectedRaw = env.qrJoinToken();
  } catch {
    return false;
  }
  const expected = Buffer.from(expectedRaw);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// Public, unauthenticated route — outside the (dashboard) route group, so
// none of its layout's getCurrentAdminUser() redirect applies here. This
// page only reads anon-readable catalog data (stations/services/queues'
// open state — see the RLS policies in
// supabase/migrations/20240101000120_rls_catalog.sql and
// 20240101000130_rls_bookings.sql); every privileged action a visitor can
// take from here goes through actions.ts, which re-checks the token itself
// and never trusts that reaching an action means this page's check already
// passed (a Server Action is its own reachable endpoint).
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // "Doesn't exist" and "wrong token" are indistinguishable from the
  // outside on purpose — same safe-default reasoning the booking detail
  // page already uses for RLS-filtered rows.
  if (!tokenMatches(token)) notFound();

  const supabase = await createClient();

  const [{ data: stations }, { data: services }, { data: stationServices }, { data: queues }] = await Promise.all([
    supabase.from("stations").select("id, name_en").is("deleted_at", null).order("name_en"),
    supabase.from("services").select("id, name_en, parent_service_id").eq("is_active", true).is("deleted_at", null),
    supabase.from("station_services").select("id, station_id, service_id").eq("is_active", true),
    supabase.from("queues").select("station_service_id, is_open").eq("is_open", true),
  ]);

  // A package group (has children) is never directly bookable/joinable —
  // same exclusion create_booking()/get_available_slots() apply themselves.
  const parentServiceIds = new Set((services ?? []).flatMap((s) => (s.parent_service_id ? [s.parent_service_id] : [])));
  const bookableServiceIds = new Set((services ?? []).filter((s) => !parentServiceIds.has(s.id)).map((s) => s.id));
  const serviceNameById = new Map((services ?? []).map((s) => [s.id, s.name_en]));
  const openStationServiceIds = new Set((queues ?? []).map((q) => q.station_service_id));

  const serviceOptions: PublicServiceOption[] = (stationServices ?? []).flatMap((ss) => {
    if (!bookableServiceIds.has(ss.service_id)) return [];
    const name = serviceNameById.get(ss.service_id);
    if (!name) return [];
    return [
      {
        stationServiceId: ss.id,
        stationId: ss.station_id,
        serviceId: ss.service_id,
        serviceName: name,
        queueIsOpen: openStationServiceIds.has(ss.id),
      },
    ];
  });

  const stationOptions: PublicStationOption[] = (stations ?? []).map((s) => ({ id: s.id, nameEn: s.name_en }));

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Gas Station</h1>
        <p className="mt-1 text-sm text-slate-500">Book an appointment or join the walk-in queue.</p>
      </div>
      <JoinFlow token={token} stations={stationOptions} services={serviceOptions} />
    </div>
  );
}
