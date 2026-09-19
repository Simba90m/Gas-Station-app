# Database Design

**Status: implemented in Phase 2.** This document was originally written as
a pre-Phase-2 plan; it's now updated to describe what was actually built —
see `supabase/migrations/` for the exact SQL, and the "Changes from the
original plan" section below for where implementation diverged slightly
from the first draft.

## Core design rules

1. **Station operating hours and service operating hours are separate
   tables.** A station can be open 24 hours while its car wash only runs
   12 PM–4 AM and its café 5 PM–4 AM. A service is only bookable when the
   station *and* the service are both open, per the project brief.
2. **Every schedule can cross midnight.** 10 PM–4 AM is stored as a normal
   start/end time pair; the booking engine (Phase 6) is responsible for
   interpreting it correctly, not the schema.
3. **UUID primary keys** everywhere, `created_at`/`updated_at` on every
   table, foreign keys enforced, soft deletion (`deleted_at`) where a row
   needs to disappear from normal use but stay for history (e.g. a
   discontinued service that past bookings still reference).
4. **Row Level Security (RLS) is the real access control**, not the app.
   Each table's policies get written in Phase 2 alongside its migration.
5. **No table is created speculatively** — every table below is used by a
   feature already described in the project brief.

## Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per authenticated user (extends Supabase `auth.users`); holds role, name, phone |
| `stations` | The 3 (eventually more) physical gas stations: name, address, lat/lng, phone, active status |
| `station_operating_hours` | Per-station, per-day-of-week open/close times |
| `employees` | Employee-specific data (linked to a `profiles` row) |
| `employee_station_assignments` | Which station(s) an employee works at |
| `employee_working_hours` | Per-employee working hours/days off — the booking engine won't offer a slot outside these |
| `shifts` | Actual clock-in/clock-out records |
| `services` | Configurable services (fuel, car wash tiers, oil change, café items, ...) — name/price/duration in EN+AR |
| `station_services` | Which services a given station offers (a service can exist without every station offering it) |
| `service_operating_hours` | Per-service, per-day-of-week open/close times (separate from station hours — see rule 1) |
| `service_resources` | Bookable resources (e.g. car wash bays), one level more specific than the plan below: attached to a station's *offering* of a service (`station_services`), not the service globally — see "Changes from the original plan" |
| `offers` | Promotions: EN/AR title, discount, date range, applicable stations/services |
| `offer_stations` | Join table: which stations an offer applies to |
| `customers` | Customer-specific data (linked to a `profiles` row) |
| `bookings` | The core operational record: customer, station, service, employee, resource, time, status |
| `booking_status_history` | Every status transition a booking goes through, with timestamp and actor |
| `queues` | A walk-up queue for a station+service combination |
| `queue_entries` | Individual customers in a queue: position, status, estimated wait |
| `feedback` | Post-booking rating + comment, linked to the specific booking/employee/service/station |
| `complaints` | Customer complaints, linked to a station/booking/employee where relevant |
| `complaint_status_history` | Status transitions for complaints, same pattern as bookings |
| `notifications` | A notification event (e.g. "booking confirmed") |
| `notification_recipients` | Who received a given notification and whether they've read it |
| `loyalty_accounts` | One per customer: current points balance |
| `loyalty_transactions` | Every points earn/spend event, so the balance is always derivable/auditable |
| `audit_logs` | Administrative actions (employee created/disabled, station changed, etc.) with actor + timestamp |
| `device_tokens` | Push notification tokens per device, per user |

This matches the table list in the project brief exactly — no table has
been added or removed.

## Key relationships (simplified)

```
stations ──< station_operating_hours
stations ──< station_services >── services ──< service_operating_hours
station_services ──< service_resources        (e.g. car wash bays — per station)
profiles ──< employee_station_assignments >── stations   (EMPLOYEE + STATION_MANAGER)
employees ──< employee_working_hours
employees ──< shifts >── stations

customers ──< bookings >── stations, station_services, service_resources, employees
bookings ──< booking_status_history
bookings ──< feedback
bookings ──< complaints ──< complaint_status_history

stations ──< queues >── station_services
queues ──< queue_entries >── customers

customers ──< loyalty_accounts ──< loyalty_transactions
profiles ──< device_tokens
profiles ──< notification_recipients >── notifications
* ──< audit_logs   (references whatever entity was changed)
```

## Preventing double-booking at the database level

Implemented as two `EXCLUDE USING gist` constraints on `bookings` (needs the
`btree_gist` extension): one over `(employee_id, time_range)`, one over
`(resource_id, time_range)`, both scoped to bookings that aren't
`CANCELLED`/`NO_SHOW`. Postgres itself rejects an overlapping INSERT/UPDATE
for the same employee or resource — this holds even under concurrent
requests, not just against a check the app does before submitting. Verified
by `supabase/tests/database/001_booking_exclusion.test.sql`, including that
a cancelled booking correctly stops blocking its old time slot.

This is why `bookings.time_range` is a real `tstzrange` (a bounded,
timezone-aware timestamp range) rather than separate `start_at`/`end_at`
columns — a `tstzrange` is what the `&&` (overlaps) operator and the
exclusion constraint work on, and it naturally represents a
midnight-crossing booking (e.g. 23:45–00:15) as an ordinary range with no
special-casing.

## Column-level privilege protection (not just RLS)

Row Level Security decides which *rows* a role can see — it can't hide one
*column* on a row a user is otherwise allowed to see. Two places in the
brief need exactly that ("customers must not see internal complaint
notes"; a user shouldn't be able to grant themselves a staff role by
updating their own profile), so those columns use Postgres column-level
`GRANT`/`REVOKE` instead:

- `complaints.internal_notes` — not selectable/updatable by `authenticated`
  at all; only reachable via `get_complaint_internal_notes()` /
  `set_complaint_internal_notes()`, which check the caller is staff at that
  complaint's station.
- `profiles.role` and `profiles.is_active` — not updatable directly (only
  `full_name`, `phone`, `preferred_locale`, `avatar_url` are); changed only
  via `set_profile_role()` / `set_profile_active()`, which check the caller
  is OWNER/MANAGER.

Verified by `supabase/tests/database/006_complaint_internal_notes.test.sql`.

## Changes from the original plan

Two refinements made while implementing, both documented in the relevant
migration file's comments:

1. **`service_resources` moved one level down.** The original sketch had
   bays attached directly to `services` (global). The brief's own bay
   example ("Station 1: Bay 1, Bay 2, Bay 3 ... configurable per station")
   only makes sense per-station, so `service_resources.station_service_id`
   references `station_services` (a specific station's offering of a
   service) instead of `services` directly.
2. **`offers.service_id`, not an `offer_services` join table.** The brief's
   table list only specifies `offer_stations`; "applicable services" is a
   single nullable `offers.service_id` column (`NULL` = every service at
   the applicable stations) rather than inventing a second join table.

## Known simplification: MANAGER's scope

The brief describes MANAGER as having "management access according to
assigned scope," but the given table list has no scope table for MANAGER
(only `employee_station_assignments`, which is for EMPLOYEE/
STATION_MANAGER). Until a scoping mechanism is specified, `is_owner_or_manager()`
(the RLS helper function) treats MANAGER identically to OWNER — all-station
access. Revisit if the business needs MANAGER scoped to a subset of
stations.

## What's intentionally not decided yet

- Loyalty point rules (points per booking, tiers, rewards) — the brief says
  not to over-engineer this initially; `loyalty_transactions` gives room to
  add rules later without a schema change
- Cancellation-deadline configurability ("cancel up to X minutes before the
  appointment") — booking-engine logic, Phase 6
- Automated notification sending (booking reminders, etc.) — Phase 9;
  for now `notifications`/`notification_recipients` can only be written by
  OWNER/MANAGER manually
