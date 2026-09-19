# Project Structure

```
Gas-Station-app/
├── apps/
│   ├── admin/                  Next.js dashboard (owner/manager/station manager)
│   │   ├── src/app/            Pages (Next.js "App Router" — one folder = one URL)
│   │   │   ├── login/          Public login page + its server action
│   │   │   └── (dashboard)/    Auth-protected: layout does the access check, everything nested needs it
│   │   ├── src/components/ui/  Admin-local reusable components (Button, Input, Card, ...)
│   │   ├── src/lib/            Supabase client setup (client/server/middleware), env validation
│   │   ├── middleware.ts       Refreshes the Supabase session cookie on every request
│   │   ├── .env.example        The REAL, loaded template — copy to apps/admin/.env (see note below)
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── mobile/                 Expo app (customer app + employee mode)
│       ├── src/app/            Screens (Expo Router — one file = one screen)
│       ├── src/components/
│       ├── metro.config.js     Bundler config (see note below)
│       └── package.json
│
├── packages/                   Code shared between apps/admin and apps/mobile
│   ├── types/                  Shared TypeScript types: user roles + a hand-scoped Database type
│   ├── utils/                  Shared business logic: timezone/currency constants, operating-day boundary math
│   ├── i18n/                   English + Arabic strings, typed so a missing translation is a build error
│   ├── ui/                     Reserved for shared components (still empty as of Phase 3 — see its own README)
│   └── config/                 Not a real package — explains where shared config actually lives
│
├── supabase/
│   ├── migrations/             SQL files that build the database, in order (Phase 2)
│   ├── seed/                   Demo data: 3 Alexandria stations, sample bookings, etc. (Phase 2)
│   └── tests/database/         pgTAP tests for the schema's critical rules (Phase 2)
│
├── docs/                       This folder — planning and architecture docs
│
├── package.json                Root workspace config + scripts (pnpm dev, pnpm build, ...)
├── pnpm-workspace.yaml         Tells pnpm which folders are packages
├── turbo.json                  Runs scripts across all apps/packages efficiently
├── tsconfig.base.json          Shared TypeScript compiler settings for packages/*
└── .env.example                Reference overview of every env var — NOT loaded by either app (see below)
```

## Why is there a `.env.example` at the root AND in `apps/admin/`?

Next.js and Expo each only load `.env` files from their own app directory,
never from a monorepo root — so a `.env` at the repo root is silently
ignored. `apps/admin/.env.example` is the real template to copy (to
`apps/admin/.env`); the root one is just a reference list of every env var
used anywhere in the project, for a quick overview.

## Why does `apps/mobile` need a custom `metro.config.js`?

Expo's bundler (Metro) doesn't automatically know how to find code inside
`packages/*` when pnpm is the package manager — pnpm links workspace
packages with symlinks, and Metro needs to be told to follow them and to
also look in the repo's root `node_modules`. `metro.config.js` turns that
on. This is a one-time setup step, not something you'll need to touch again.

## Why does `apps/admin`'s `next.config.ts` list `transpilePackages`?

`packages/types`, `packages/utils`, and `packages/i18n` are plain
TypeScript source files (not pre-compiled to JavaScript) — that's simpler
for a project this size, since it avoids adding a build step to every shared
package. Next.js needs to be told to compile those packages itself when it
compiles the admin app; `transpilePackages` does that.

## Naming convention

Every workspace package is named `@gas-station/<folder-name>` (e.g.
`@gas-station/types`). This namespace makes it unambiguous in import
statements that a module is our own shared code, not a third-party npm
package — e.g. `import { UserRole } from "@gas-station/types"`.
