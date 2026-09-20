import type { NextRequest } from "next/server";
import { updateSession } from "./src/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and image optimization files — no session cookie
    // work needed for those. Also skip /join and everything under it: the
    // public, token-gated QR flow (apps/admin/src/app/join/[token]/) is
    // outside the (dashboard) route group on purpose — its own pages/
    // actions never call getCurrentAdminUser() (see (dashboard)/layout.tsx,
    // the actual place dashboard routes redirect an unauthenticated
    // visitor to /login) and it establishes its own customer session
    // itself when needed (see join/[token]/actions.ts). Excluding it here
    // means middleware never touches cookies for an anonymous QR visitor,
    // and makes "this path is public" a fact anyone reading this matcher
    // can see directly, not just an implicit consequence of folder layout.
    // `join(?:/|$)` matches exactly "join" or "join/..." — NOT "join-qr",
    // the admin-only QR code page, which must stay behind the dashboard's
    // normal auth check.
    "/((?!_next/static|_next/image|favicon.ico|join(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
