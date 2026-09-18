# packages/config

**Deviation from the suggested structure:** shared TypeScript compiler options
live in `/tsconfig.base.json` at the repo root instead of in a package here,
because it's just one JSON file with no code — a package around it would add
an indirection for no benefit. `apps/admin` and `apps/mobile` keep their own
framework-generated `tsconfig.json` (Next.js and Expo both require specific
settings their CLIs already configured correctly); `packages/*` extend the
root base directly.

If shared ESLint rules are needed across apps later, they'll live here as
`@gas-station/config` — not added now because both apps' generated lint
configs (`eslint-config-next`, `eslint-config-expo`) already work and there's
nothing to share yet.
