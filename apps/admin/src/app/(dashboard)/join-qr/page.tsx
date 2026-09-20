import { headers } from "next/headers";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { env } from "@/lib/env";

/**
 * The origin the QR code's URL is built from. JOIN_BASE_URL wins when set —
 * it's the only correct choice for LAN testing (the request that renders
 * *this admin page* carries whatever Host the browser viewing it used, e.g.
 * Host: localhost:3000 from the laptop, which a phone on the network can't
 * resolve to the laptop) and for any production deployment whose proxy
 * doesn't forward the real public host. Falling back to request headers
 * keeps this working with zero config for the common case (viewing the
 * admin app at its real, already-public URL — including a hosted preview
 * or a LAN-testing setup where the admin app is itself opened via the LAN
 * IP, not localhost).
 */
async function resolveJoinBaseUrl(): Promise<{ url: string; source: "JOIN_BASE_URL" | "request" }> {
  const configured = env.joinBaseUrl();
  if (configured) return { url: configured.replace(/\/+$/, ""), source: "JOIN_BASE_URL" };

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { url: `${proto}://${host}`, source: "request" };
}

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

  const { url: baseUrl, source } = await resolveJoinBaseUrl();
  const joinUrl = `${baseUrl}/join/${token}`;
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

      {source === "request" && (
        <p className="mt-3 text-xs text-slate-400">
          This link was built from the request you loaded this page with. If a phone on your network can&apos;t reach
          it (e.g. it shows &quot;localhost&quot;), set <code>JOIN_BASE_URL</code> to this computer&apos;s LAN address
          — for example <code>http://192.168.8.26:3000</code> — in <code>apps/admin/.env</code> and restart the dev
          server. In production, set it to your real public URL.
        </p>
      )}
    </div>
  );
}
