import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared workspace packages ship TypeScript source (no build step),
  // so Next needs to transpile them itself.
  transpilePackages: ["@gas-station/types", "@gas-station/utils", "@gas-station/i18n"],
  // Don't auto-write AGENTS.md/CLAUDE.md into apps/admin on every dev/build run.
  agentRules: false,
};

export default nextConfig;
