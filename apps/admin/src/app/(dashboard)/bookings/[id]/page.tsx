import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { parseTimeRange } from "@gas-station/utils";
import { StatusActions } from "./status-actions";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, station_id, station_service_id, customer_id, employee_id, resource_id, time_range, status, price, customer_notes, cancellation_reason, cancelled_at, created_at",
    )
    .eq("id", id)
    .single();

  // "Doesn't exist" and "you don't have access" are indistinguishable from
  // the outside under RLS — the same safe default the stations/employees
  // modules already use.
  if (bookingError || !booking) notFound();

  const [{ data: station }, { data: stationService }, { data: customer }, { data: employee }, { data: resource }, { data: history }] =
    await Promise.all([
      supabase.from("stations").select("name_en").eq("id", booking.station_id).single(),
      supabase.from("station_services").select("service_id").eq("id", booking.station_service_id).single(),
      supabase.from("profiles").select("full_name, phone").eq("id", booking.customer_id).single(),
      booking.employee_id
        ? supabase.from("profiles").select("full_name").eq("id", booking.employee_id).single()
        : Promise.resolve({ data: null }),
      booking.resource_id
        ? supabase.from("service_resources").select("name_en").eq("id", booking.resource_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("booking_status_history")
        .select("id, status, note, created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: true }),
    ]);

  const service = stationService
    ? (await supabase.from("services").select("name_en").eq("id", stationService.service_id).single()).data
    : null;

  const range = parseTimeRange(booking.time_range);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Booking</h1>
        <p className="mt-1 text-sm text-slate-500">
          {station?.name_en ?? "Unknown station"} · {service?.name_en ?? "Unknown service"}
        </p>
      </div>

      <Card>
        <StatusActions bookingId={booking.id} initialStatus={booking.status} />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-slate-500">Time</dt>
          <dd className="text-slate-900">
            {range ? `${new Date(range.start).toLocaleString()} → ${new Date(range.end).toLocaleString()}` : "Unknown"}
          </dd>
          <dt className="text-slate-500">Customer</dt>
          <dd className="text-slate-900">
            {customer?.full_name ?? "Unknown"} {customer?.phone ? `(${customer.phone})` : ""}
          </dd>
          <dt className="text-slate-500">Employee</dt>
          <dd className="text-slate-900">{employee?.full_name ?? "No preference"}</dd>
          <dt className="text-slate-500">Resource</dt>
          <dd className="text-slate-900">{resource?.name_en ?? "—"}</dd>
          <dt className="text-slate-500">Price</dt>
          <dd className="text-slate-900">{booking.price} EGP</dd>
          {booking.customer_notes && (
            <>
              <dt className="text-slate-500">Customer notes</dt>
              <dd className="text-slate-900">{booking.customer_notes}</dd>
            </>
          )}
          {booking.cancellation_reason && (
            <>
              <dt className="text-slate-500">Cancellation reason</dt>
              <dd className="text-slate-900">{booking.cancellation_reason}</dd>
            </>
          )}
        </dl>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">Status history</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {(history ?? []).map((h) => (
            <li key={h.id} className="flex justify-between text-slate-600">
              <span>{h.status.replace("_", " ")}</span>
              <span>{new Date(h.created_at).toLocaleString()}</span>
            </li>
          ))}
          {(!history || history.length === 0) && <li className="text-slate-400">No history recorded yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
