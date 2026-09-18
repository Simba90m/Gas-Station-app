// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch shared packages in the monorepo so Metro picks up their changes.
config.watchFolders = [workspaceRoot];

// pnpm links workspace packages (@gas-station/*) via symlinks, and keeps
// each package's own dependencies nested inside its own node_modules
// (rather than flattening everything) — Metro needs to follow symlinks and
// keep its normal directory-by-directory node_modules lookup (do NOT set
// disableHierarchicalLookup) for that nested structure to resolve.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
