import path from "node:path";
import type { NextConfig } from "next";
import { env } from "./src/lib/env";

/**
 * Next.js's dev server (`next dev`) only accepts its HMR/Fast Refresh
 * websocket from an explicitly trusted origin — anything else (a phone on
 * the LAN hitting this machine's LAN IP, or even plain 127.0.0.1) is
 * silently blocked. That breaks client-side interactivity for the whole
 * page in dev mode (confirmed by reproduction: the exact same component
 * works correctly in a production build, and the failure is always
 * accompanied by "Blocked cross-origin request to Next.js dev resource" in
 * the dev server's own log) — it is not a bug in the page's own code.
 *
 * Derived from JOIN_BASE_URL — the same LAN/public origin already
 * configured so the QR code's link is correct (see lib/env.ts) — rather
 * than hardcoding an IP here, so this tracks whatever address is actually
 * used to reach the dev server without needing a second place to update it.
 * Only the hostname is needed (matches the exact form Next.js's own warning
 * prints, e.g. `['127.0.0.1']`), and this config key is dev-server-only —
 * `next build`/`next start` ignore it, so production behavior is unchanged
 * whether or not JOIN_BASE_URL is set.
 */
function allowedDevOrigins(): string[] | undefined {
  const joinBaseUrl = env.joinBaseUrl();
  if (!joinBaseUrl) return undefined;
  try {
    return [new URL(joinBaseUrl).hostname];
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  // Shared workspace packages ship TypeScript source (no build step),
  // so Next needs to transpile them itself.
  transpilePackages: ["@gas-station/types", "@gas-station/utils", "@gas-station/i18n"],
  // Don't auto-write AGENTS.md/CLAUDE.md into apps/admin on every dev/build run.
  agentRules: false,
  allowedDevOrigins: allowedDevOrigins(),
  turbopack: {
    // Turbopack auto-detects the workspace root by walking up for a
    // lockfile, but its own docs warn this can miss dependencies of a
    // *linked* workspace package (e.g. packages/utils, pulled into this
    // app via transpilePackages) that only exist in the monorepo root's
    // node_modules under this repo's hoisted pnpm layout (see .npmrc) —
    // observed on Windows as "Module not found: Can't resolve
    // 'libphonenumber-js'" even though it's correctly declared as a
    // dependency of both packages/utils and this app. Setting the root
    // explicitly (two levels up: apps/admin -> monorepo root) removes the
    // auto-detection guesswork entirely.
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
