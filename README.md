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

## Current status: Phase 2 — Database, auth, RLS

| Phase | Status |
|---|---|
| 0. Planning & architecture | ✅ Done |
| 1. Repo setup, monorepo, tooling | ✅ Done |
| 2. Database, auth, RLS | ✅ Done (this commit) |
| 3. Admin dashboard foundation | ⬜ Next |
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
  /migrations   Database schema — 27 tables, RLS policies, triggers (numbered, applied in order)
  /seed         Demo data for 3 Alexandria stations (numbered, applied in order)
  /tests        pgTAP tests for the schema's critical rules
/docs           Architecture, database design, and other planning docs
```

Full explanation: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md).

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- [pnpm](https://pnpm.io) 10+ — install with `corepack enable` or `npm i -g pnpm`
- **New in Phase 2:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Supabase's local stack runs in Docker) and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (`npx supabase --version` works with no separate install, or `brew install supabase/tap/supabase`)

## Database setup (Supabase) — do this once

Everything below runs **locally** in Docker — no real Supabase account or
project is required to develop against the database. `supabase/config.toml`
already has a project configured for this repo.

```bash
# 1. Start the local Supabase stack (Postgres, Auth, Storage, Studio, API).
#    First run downloads Docker images — a couple of minutes.
npx supabase start

# This prints a block of local URLs and keys, e.g.:
#   API URL: http://127.0.0.1:54321
#   anon key: eyJ...
#   service_role key: eyJ...
#   DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   Studio URL: http://127.0.0.1:54323

# 2. Apply every migration in supabase/migrations/ AND seed data in
#    supabase/seed/ against that local database, from a clean slate.
npx supabase db reset
```

`supabase db reset` is the command to re-run any time the migrations or
seed files change — it wipes the local database and rebuilds it from
scratch, so it's always safe (this is a local dev database, never
production data).

Open **Studio** (the URL printed above, normally http://127.0.0.1:54323) to
browse the schema and seeded data in a UI — this is the easiest way to look
around without writing SQL.

### Demo accounts (seeded, local only)

Every seeded account uses the password `password123`. Real accounts must never
use a shared password like this — this is exclusively for local development.

| Role | Email |
|---|---|
| Owner | `owner@demo.gasstation.test` |
| Manager | `manager@demo.gasstation.test` |
| Station Manager (Station 1) | `manager.station1@demo.gasstation.test` |
| Employee (Station 1, day shift) | `ahmed.wash@demo.gasstation.test` |
| Employee (Station 1, night shift) | `karim.wash@demo.gasstation.test` |
| Customer | `customer1@demo.gasstation.test` |

(Full list, and what data each account can see, in
`supabase/seed/02_staff.sql` and `05_customers.sql`.)

### Connect the apps to it

```bash
cp .env.example .env
```

Fill in `.env` with the local values `supabase start` printed:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key printed above>
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key printed above>
```

Leave `SUPABASE_SERVICE_ROLE_KEY` unset unless you're writing a trusted
server-side/admin script — it bypasses Row Level Security entirely and must
never be shipped inside either app.

Neither app actually calls Supabase yet (no screens use it) — that starts
in Phase 3/4. This step just gets the connection ready.

### Using a real (hosted) Supabase project instead

Not required for local development, but when you're ready to deploy:

1. Create a project at [supabase.com](https://supabase.com) (you'll need to
   set a database password — generate and save a strong one).
2. `npx supabase link --project-ref <your-project-ref>` (found in the
   project's Settings → General).
3. `npx supabase db push` — applies every migration in
   `supabase/migrations/` to that hosted project.
4. Seed data is meant for local development only — don't run
   `supabase/seed/` against a real project (it creates fictional demo
   accounts and bookings).
5. Put the hosted project's URL/anon key into `.env` the same way as above
   (Settings → API in the Supabase dashboard).

### Running the database tests

```bash
npx supabase test db
```

This runs every `.sql` file in `supabase/tests/database/` (pgTAP tests)
against a fresh copy of the migrated database. See "What was implemented"
below for what they check.

## How to run the apps

```bash
# 1. Install all dependencies for both apps + shared packages
pnpm install

# 2. (See "Database setup" above first, if you haven't)

# 3. Run the admin dashboard (http://localhost:3000)
pnpm dev:admin

# 4. Run the mobile app (opens Expo dev tools — scan the QR code with
#    Expo Go on your phone, or press `w` for a browser preview)
pnpm dev:mobile
```

You can also run both at once with `pnpm dev`.

## What to test right now (Phase 2)

- [ ] `npx supabase start` succeeds and prints local URLs/keys
- [ ] `npx supabase db reset` applies all migrations and seed data with no errors
- [ ] Studio (http://127.0.0.1:54323) shows 3 stations, staff, services, bookings, etc.
- [ ] `npx supabase test db` — all pgTAP tests pass
- [ ] `pnpm install && pnpm typecheck` still passes for both apps and all shared packages
- [ ] Signing in as `owner@demo.gasstation.test` (e.g. via Studio's SQL editor or a REST call) can see all 3 stations' bookings; signing in as `customer1@demo.gasstation.test` can only see their own

There are still no real app screens — that starts in Phase 3/4. This phase
is entirely the database foundation underneath them.

## Known limitations (Phase 2)

- No real app screens yet — neither app calls Supabase
- MANAGER is currently treated the same as OWNER (all-station access) —
  the brief describes a narrower "assigned management scope" but doesn't
  define a table for it; documented in `docs/DATABASE_DESIGN.md` and the
  migration comments as a decision to revisit if a real scoping need shows up
- Cancellation-deadline configurability ("cancel up to X minutes before
  the appointment") isn't enforced yet — that's booking-engine logic (Phase 6)
- No automated TypeScript types generated from the schema yet — needs
  Docker running locally; see `docs/DATABASE_DESIGN.md`
- Real push/email notification delivery isn't built — `notifications`/
  `notification_recipients` exist as a data model only (Phase 9)

## What's next (Phase 3)

Admin dashboard foundation: Supabase Auth wired into `apps/admin`, a login
screen, and station management (list/create/edit stations) — the first
real screens built on top of this phase's schema and RLS policies.

## Tech stack

- **Mobile:** React Native, Expo, TypeScript, Expo Router, TanStack Query, React Hook Form, Zod (query/form/validation libs added when Phase 4 first needs them)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Row Level Security)
- **Admin:** Next.js, TypeScript, Tailwind CSS
- **Monorepo:** pnpm workspaces + Turborepo
