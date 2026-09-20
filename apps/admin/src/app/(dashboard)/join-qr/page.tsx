import { headers } from "next/headers";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { env } from "@/lib/env";

// One company-wide QR code (decision #4 from the Phase 7.3 design): it
// encodes /join/<QR_JOIN_TOKEN>, the same token apps/admin/src/app/join/
// [token]/actions.ts checks the URL param against. Printed once per
// station — the customer picks their station inside the /join flow itself,
// so nothing here needs to be per-station.
export default async function JoinQrPage() {
  let token: string;
  try {
    token = env.qrJoinToken();
  } catch {
    return (
      <div className="max-w-lg">
        <h1 className="text-lg font-semibold text-slate-900">Customer QR code</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          QR_JOIN_TOKEN isn&apos;t set on this server yet — ask an owner/manager to configure it (see
          apps/admin/.env.example).
        </p>
      </div>
    );
  }

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const joinUrl = `${proto}://${host}/join/${token}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl, { margin: 1, width: 320 });

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-900">Customer QR code</h1>
      <p className="mt-1 text-sm text-slate-500">
        Print this and display it at each station. Customers scan it to book an appointment or join the walk-in queue
        without an app or an account of their own.
      </p>

      <Card className="mt-6 flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI, not an optimizable remote/static asset */}
        <img src={qrDataUrl} alt="Scan to book or join the queue" width={320} height={320} />
        <p className="break-all text-center text-xs text-slate-500">{joinUrl}</p>
      </Card>
    </div>
  );
}
