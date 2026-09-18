# Gas Station Platform

A unified digital platform for a 3-station gas station business in
Alexandria, Egypt — covering customer bookings, employee operations, and
owner/manager analytics in one connected system.

This is a **real operational platform**, not just a marketing app: a
customer booking a car wash creates data the employee, station manager, and
owner all see, through to the customer's post-service feedback.

New to this project? Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
first — it explains *why* things are built this way, written for someone
without a software background.

## Current status: Phase 1 — Repository setup & tooling

| Phase | Status |
|---|---|
| 0. Planning & architecture | ✅ Done |
| 1. Repo setup, monorepo, tooling | ✅ Done (this commit) |
| 2. Database, auth, RLS | ⬜ Next |
| 3. Admin dashboard foundation | ⬜ Not started |
| 4. Customer mobile app foundation | ⬜ Not started |
| 5+ | ⬜ Not started |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full phase plan.

## Project structure

```
/apps
  /admin    Next.js owner/manager dashboard
  /mobile   Expo app — customer app + employee mode
/packages
  /types    Shared TypeScript types (roles now; DB-derived domain types from Phase 2)
  /utils    Shared business logic (timezone/currency constants now; booking engine from Phase 6)
  /i18n     Centralized English/Arabic strings, typed, RTL-aware
  /ui       Reserved for shared UI components (starts Phase 3)
  /config   Not a package — see packages/config/README.md
/supabase
  /migrations   Database schema (Phase 2)
  /seed         Demo data for 3 Alexandria stations (Phase 2)
/docs           Architecture, database design, and other planning docs
```

Full explanation: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md).

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- [pnpm](https://pnpm.io) 10+ — install with `corepack enable` or `npm i -g pnpm`

## How to run it

```bash
# 1. Install all dependencies for both apps + shared packages
pnpm install

# 2. Copy environment variables (Supabase keys not needed until Phase 2 —
#    apps run without them for now, they just won't talk to a database yet)
cp .env.example .env

# 3. Run the admin dashboard (http://localhost:3000)
pnpm dev:admin

# 4. Run the mobile app (opens Expo dev tools — scan the QR code with
#    Expo Go on your phone, or press `w` for a browser preview)
pnpm dev:mobile
```

You can also run both at once with `pnpm dev`.

## What to test right now (Phase 1)

- [ ] `pnpm install` completes with no errors
- [ ] `pnpm dev:admin` starts and `http://localhost:3000` shows the default Next.js page
- [ ] `pnpm dev:mobile` starts Expo and the app loads (web preview or Expo Go) showing the default Expo Router tabs
- [ ] `pnpm typecheck` passes for both apps and all shared packages

There are no real screens yet — both apps show their framework's default
starter page. That's expected for Phase 1; real screens start in Phase 3/4.

## Known limitations (Phase 1)

- No database yet — nothing persists, no login works yet
- No real screens — default Next.js/Expo starter pages only
- `packages/ui` is an empty placeholder until Phase 3
- Maps provider and exact Supabase project are not yet chosen/created

## What's next (Phase 2)

Supabase project setup, the full database schema (stations, services,
bookings, employees, etc.) as SQL migrations, Row Level Security policies
enforcing the 5 roles, Supabase Auth wiring, and seed data for the 3
Alexandria stations. See [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)
for the plan.

## Tech stack

- **Mobile:** React Native, Expo, TypeScript, Expo Router, TanStack Query, React Hook Form, Zod (query/form/validation libs added when Phase 4 first needs them)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Row Level Security)
- **Admin:** Next.js, TypeScript, Tailwind CSS
- **Monorepo:** pnpm workspaces + Turborepo
