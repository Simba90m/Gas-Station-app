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

## Current status: Phase 3 — Admin dashboard foundation & station management

| Phase | Status |
|---|---|
| 0. Planning & architecture | ✅ Done |
| 1. Repo setup, monorepo, tooling | ✅ Done |
| 2. Database, auth, RLS | ✅ Done |
| 3. Admin dashboard foundation & station management | ✅ Done (this commit) |
| 4. Customer mobile app foundation | ⬜ Next |
| 5+ | ⬜ Not started |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full phase plan.

## Project structure

```
/apps
  /admin    Next.js owner/manager dashboard
  /mobile   Expo app — customer app + employee mode
/packages
  /types    Shared TypeScript types — roles + a hand-scoped Database type (see packages/types/src/database.ts)
  /utils    Shared business logic (timezone/currency constants, operating-day boundary math; booking engine from Phase 6)
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
cp apps/admin/.env.example apps/admin/.env
```

**This must be `apps/admin/.env`, not a `.env` at the repo root** — Next.js
only loads `.env` files from the directory `next.config.ts` is in, so a
root-level `.env` is silently ignored by `pnpm dev:admin`. (The root
`.env.example` is a reference overview of every env var used across the
project, not something either app actually reads — see the comment at the
top of that file.)

Fill in `apps/admin/.env` with the local values `supabase start` printed:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the anon key printed above>
```

(The local CLI prints this value labeled "anon key" — it's the same kind
of key a hosted Supabase project calls the publishable key; use it here
either way.)

Leave `SUPABASE_SERVICE_ROLE_KEY` unset unless you're writing a trusted
server-side/admin script — it bypasses Row Level Security entirely and must
never be shipped inside either app.

`apps/admin` requires the two `NEXT_PUBLIC_*` values above to even start
(it fails fast with a clear error if they're missing — see
`apps/admin/src/lib/env.ts`). `apps/mobile` doesn't call Supabase yet
(Phase 4).

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
5. Put the hosted project's URL and publishable key into `apps/admin/.env`
   the same way as above (Settings → API in the Supabase dashboard, under
   "Publishable key").

### First admin on a real project

Seed data (with its fictional demo accounts) intentionally never runs
against a real project, so a freshly created hosted project has **no**
`OWNER`/`MANAGER` yet. New sign-ups always start as `CUSTOMER`
(`handle_new_user()` in `supabase/migrations/20240101000070_auth_handlers.sql`
guarantees that — nothing at signup can grant a higher role), and
promoting someone requires an *existing* `OWNER`/`MANAGER` — a
chicken-and-egg gap on a brand-new project.

To get past it once:

1. Create your account the normal way (sign up, or have Supabase Auth
   create the user) — it'll land as `CUSTOMER`, and the admin dashboard
   will correctly refuse it for now.
2. Run:
   ```bash
   pnpm db:bootstrap-owner
   ```
   It'll ask for that account's email and password (typed straight into
   your terminal, never stored or committed) and call the
   `bootstrap_first_owner()` database function
   (`supabase/migrations/20240101000160_bootstrap_first_owner.sql`), which
   promotes that account to `OWNER` — but only while no `OWNER`/`MANAGER`
   exists yet. It permanently refuses the moment one does, so it's safe to
   leave in the repo; every promotion after the first goes through the
   normal owner/manager-only path in the admin dashboard.

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

## Using the admin dashboard

Once `apps/admin/.env` is filled in (see above) and `pnpm dev:admin` is running:

1. Open http://localhost:3000 — it redirects to `/login`.
2. Sign in with a seeded staff account, e.g. `owner@demo.gasstation.test` /
   `password123` (full list above). Customer and employee accounts are
   correctly refused here — they get a clear message and are signed back
   out, not a confusing empty dashboard.
3. **Dashboard** (`/`) shows real counts — today's bookings, open
   complaints, average rating, etc. — queried live from Supabase, scoped by
   Row Level Security to whatever the signed-in role can see. A metric
   shows "Not enough data" rather than a fake `0` when there's genuinely
   nothing to show yet (e.g. no feedback submitted).
4. **Stations** (`/stations`) lists every station; **New station**
   (owner/manager only — station managers get a real error from the
   database, not just a hidden button, if they try) and each station's
   detail page let you edit its details, activate/deactivate it, and set
   its weekly operating hours (including hours that cross midnight, e.g.
   22:00 → 04:00 — try it against the seeded stations to see it accepted).

Try signing in as `manager.station1@demo.gasstation.test` afterward to see
the difference: the dashboard's counts are the same (most of those tables
aren't station-scoped by role), but editing Station 2 or Station 3's
details correctly fails — Postgres RLS, not the UI, is what's actually
stopping it.

## What to test right now (Phase 3)

- [ ] `npx supabase start` && `npx supabase db reset` — clean local database
- [ ] `npx supabase test db` — all pgTAP tests pass
- [ ] `pnpm install && pnpm typecheck && pnpm lint` — clean across all 5 packages
- [ ] `pnpm build --filter=@gas-station/admin` — production build succeeds
- [ ] Log in as `owner@demo.gasstation.test` → dashboard shows real numbers; create a station; edit a station; set its hours with a midnight-crossing window (e.g. 22:00 → 04:00)
- [ ] Log in as `manager.station1@demo.gasstation.test` → can edit Station 1, cannot edit Station 2/3 (real RLS error, not a hidden button)
- [ ] Log in as `customer1@demo.gasstation.test` → refused with a clear message, not let into the dashboard
- [ ] Sign out via the header button returns to `/login`

## Known limitations (Phase 3)

- No employee/customer management, services, bookings, offers, complaints,
  or analytics screens yet — those are their own later phases (5–11); this
  phase is the dashboard's auth + layout foundation and station management
  specifically, per the brief's Phase 3 scope.
- Station *service* configuration (which services a station offers, car
  wash bays, service-specific hours) isn't in the admin UI yet — the
  database already supports it (`station_services`, `service_resources`,
  `service_operating_hours`), but configuring it through screens is later
  phase territory, not "station management" in the narrow Phase 3 sense.
- Admin UI strings are English-only for now — `packages/i18n` exists and
  is ready, but wiring a bilingual/RTL admin dashboard wasn't done in this
  phase to keep scope to "dashboard foundation + station management";
  Arabic *input* (station name/address in Arabic) is already supported in
  the forms, since that's data, not UI chrome.
- `packages/types/src/database.ts` is hand-written and scoped to exactly
  what Phase 3 queries (documented at the top of that file) — extend it as
  later phases need more tables, or replace it with a real generated file
  once Docker is available (`pnpm db:types`).
- MANAGER is still treated the same as OWNER (carried over from Phase 2 —
  see `docs/DATABASE_DESIGN.md`).

## What's next (Phase 4)

Customer mobile app foundation: station discovery and service browsing in
`apps/mobile`, built on the same database and RLS policies.

## Tech stack

- **Mobile:** React Native, Expo, TypeScript, Expo Router, TanStack Query, React Hook Form, Zod (query/form/validation libs added when Phase 4 first needs them)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Row Level Security)
- **Admin:** Next.js (App Router), TypeScript, Tailwind CSS, `@supabase/ssr` for cookie-based auth, Zod for input validation
- **Monorepo:** pnpm workspaces + Turborepo
