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
| 4. Customer mobile app foundation | ✅ Done (this commit) |
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

### Phone/email OTP (public join flow customer verification)

The public `/join/[token]` flow verifies a customer by phone OTP, then email
OTP, before creating/using their account — see
`supabase/migrations/20240101000270_customer_dual_channel_verification.sql`
for why. Locally, no real SMS vendor or spend is needed: `[auth.sms.test_otp]`
in `supabase/config.toml` maps a couple of fixed test phone numbers to fixed
codes (e.g. `+201000000001` → `123456`) — use one of those numbers when
testing the flow locally instead of a real phone, and the local stack never
sends a real SMS. Email OTP uses the local stack's own mail (viewable via
Inbucket, printed in the `supabase start` output) — no real email vendor
needed locally either.

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
`apps/admin/src/lib/env.ts`).

`apps/mobile` needs the same project, its own env file:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the same anon/publishable key as above>
```

(Same key, different env var name/prefix — `EXPO_PUBLIC_` is Expo's
equivalent of Next's `NEXT_PUBLIC_`, see `apps/mobile/src/lib/env.ts`.)
See "Customer mobile app (Phase 4)" below for what's implemented and the
one extra Supabase Auth setting (`enable_anonymous_sign_ins`) it needs.

### Using a real (hosted) Supabase project instead

Not required for local development, but when you're ready to deploy:

1. Create a project at [supabase.com](https://supabase.com) (you'll need to
   set a database password — generate and save a strong one).
2. `npx supabase link --project-ref <your-project-ref>` (found in the
   project's Settings → General).
3. `npx supabase db push` — applies every migration in
   `supabase/migrations/` to that hosted project.
4. Optional: if this hosted project is a **development/demo** project (never
   production), you can load the same fictional demo data local dev uses —
   see "Seeding a hosted development project" below.
5. Put the hosted project's URL and publishable key into `apps/admin/.env`
   the same way as above (Settings → API in the Supabase dashboard, under
   "Publishable key").
6. To actually use the public join flow's phone/email OTP verification on
   this hosted project (not just apply the schema that supports it):
   - Authentication → Providers → **Phone**: enable it, choose Twilio, and
     enter the same Account SID / Auth Token / Messaging Service SID as
     `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGE_SERVICE_SID`
     in `.env.example` (root) — a real Twilio account is required; this is
     the one piece of this setup that isn't free.
   - Authentication → **Emails**: enable "Confirm email" (matches
     `enable_confirmations = true` under `[auth.email]` in
     `supabase/config.toml`).
   - Without this step, `supabase db push` still applies the schema fine,
     but a customer's phone/email OTP request will fail at send time.
7. To let the mobile app's Start Now / Book for Later actually work on
   this hosted project: Authentication → Settings → enable **"Allow
   anonymous sign-ins"** (matches `enable_anonymous_sign_ins = true` under
   `[auth]` in `supabase/config.toml`). Free, no external account needed —
   unlike step 6, this one has no cost.

### Seeding a hosted development project

**Development/demo data only — never run this against a project with real
customers.** It creates fictional accounts (`owner@demo.gasstation.test` and
friends, all password `password123`) and fictional bookings/complaints/etc.
— fine for a shared dev/staging project only you and your team can reach,
never for production.

```bash
npx supabase db push --include-seed
```

`--include-seed` is the Supabase CLI's own built-in flag for this — it runs
`supabase/seed/*.sql` (the same files, same order, `[db.seed]` in
`supabase/config.toml`) against the linked project, right after applying any
pending migrations. Nothing is hand-written or duplicated for the hosted
case; it's the exact same seed data local dev has always used.

Every insert in `supabase/seed/*.sql` is guarded (`ON CONFLICT ... DO
NOTHING`, or an equivalent `WHERE NOT EXISTS` where a table has no usable
unique constraint) — safe to run more than once. A second run touches
nothing that already exists: no duplicate stations/employees/bookings, and
(since `loyalty_transactions` inserts also award loyalty points via a
trigger) no double-counted points either. It also never touches your own
account — the demo data uses its own fixed, fictional IDs, completely
separate from whatever real account you signed up with.

If you already bootstrapped your own `OWNER` account (see "First admin on a
real project" below), the seed additionally creates its own demo `OWNER`
(`owner@demo.gasstation.test`) — both accounts coexist fine; use whichever
you want to sign in with.

### First admin on a real project

Seed data never runs against a hosted project unless you explicitly opt in
with `--include-seed` (see above) — by default, a freshly created hosted
project has **no** `OWNER`/`MANAGER` at all. New sign-ups always start as
`CUSTOMER`
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

## Station management: search and staff count (added after Phase 3)

The stations list now also has a search box (filters by name/address) and
a per-station staff count, alongside what Phase 3 already had (create/edit,
activate/deactivate, operating hours including midnight-crossing windows
like 22:00 → 04:00). Station *service* configuration and dedicated
employee-assignment screens are still not built — see "Known limitations"
above; they're natural additions on top of the same station detail page
(one more `<Card>` section each), not a different architecture. Adding a
4th, 5th, ... station needs nothing beyond the "New station" form already
in the admin UI — no schema or code change.

## Customer mobile app (Phase 4)

`apps/mobile` (Expo + Expo Router) now implements the first real
customer-facing journey, entirely on the existing backend — no new tables,
no queue/booking/availability logic duplicated client-side:

**Screens**: Home → Station selection → Service selection → "What do you
need?" (Start Now / Book for Later) → live queue ticket (Start Now) or
date/slot picker → confirmation (Book for Later). English by default,
Arabic fully translated and switchable live (top-right toggle on Home) —
see `packages/i18n`.

**Backend calls reused, none duplicated**: `get_available_slots()`,
`create_booking()`, `join_queue()`, `get_queue_ticket_status()` (a new,
authenticated-session-authorized replacement for the removed
`kiosk_queue_status()` — see
`supabase/migrations/20240101000270_customer_dual_channel_verification.sql`),
plus anon-readable `stations`/`services`/`station_services`/`queues`
queries for browsing.

**Anonymous sessions**: `join_queue()`/`create_booking()` require a real
session (`owns_customer_row()`). Since phone/email OTP isn't wired up for
mobile yet, the app calls `supabase.auth.signInAnonymously()` lazily,
right before the first such action — a real, RLS-respecting Supabase Auth
session, not a new bypass. Requires
`supabase/config.toml`'s `enable_anonymous_sign_ins = true`, and the
equivalent on a hosted project: Dashboard → Authentication → Settings →
"Allow anonymous sign-ins." An anonymous session is designed to be
upgraded in place later (`supabase.auth.updateUser()`) once phone/email
verification lands for mobile, the same `signInWithOtp`/`verifyOtp`
sequence the admin app's public join flow already uses.

Connect the app the same way as admin: `cp apps/mobile/.env.example
apps/mobile/.env` and fill in `EXPO_PUBLIC_SUPABASE_URL`/
`EXPO_PUBLIC_SUPABASE_ANON_KEY` with the same values `apps/admin/.env` uses.

**Known limitations**: date picking is a prev/next-day stepper, not a
calendar widget (every date is still reachable, just one at a time);
employee selection is always automatic (`create_booking()`'s own default)
since the UI never offers a choice yet; a parent/category service is
correctly filtered out of the picker, but there's no drill-down UI for one
yet (no station currently seeds one); realtime queue status combines a
Realtime subscription on the customer's own entry with a 15s poll for
rank changes driven by other customers, since RLS only lets a customer
read their own `queue_entries` row (see
`apps/mobile/src/hooks/use-queue-status.ts`). OTP/SMS/email verification,
real customer registration, vehicle maintenance, loyalty, payments,
offers, and push notifications are all explicitly out of scope for this
phase.

## Tech stack

- **Mobile:** React Native, Expo, TypeScript, Expo Router, TanStack Query, React Hook Form, Zod (query/form/validation libs added when Phase 4 first needs them)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Row Level Security)
- **Admin:** Next.js (App Router), TypeScript, Tailwind CSS, `@supabase/ssr` for cookie-based auth, Zod for input validation
- **Monorepo:** pnpm workspaces + Turborepo
