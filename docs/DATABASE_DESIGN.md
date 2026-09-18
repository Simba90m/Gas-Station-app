# Database Design Plan (Phase 2 preview)

This is the **plan** for the database — not the database itself. Actual SQL
migrations, Row Level Security policies, and seed data are built in Phase 2
against this plan. Documenting it now lets you review the shape of the data
before any code depends on it.

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
| `service_resources` | Bookable resources a service needs, e.g. car wash bays; tracks count and maintenance status |
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
services ──< service_resources                (e.g. car wash bays)
employees ──< employee_station_assignments >── stations
employees ──< employee_working_hours

customers ──< bookings >── stations, services, employees, service_resources
bookings ──< booking_status_history
bookings ──< feedback
bookings ──< complaints ──< complaint_status_history

stations ──< queues >── services
queues ──< queue_entries >── customers

customers ──< loyalty_accounts ──< loyalty_transactions
profiles ──< device_tokens
* ──< audit_logs   (references whatever entity was changed)
```

## Preventing double-booking at the database level

The project brief requires this to be correct even if two customers try to
book the same employee/bay at the same moment — not just checked in the
app before submitting. The Phase 2 plan for this: an exclusion constraint
on `bookings` (Postgres `EXCLUDE USING gist`) over
`(employee_id, resource_id, time_range)` so overlapping ranges for the same
employee or resource are rejected by Postgres itself, plus a transaction
around the booking-creation flow. This gets implemented and tested in Phase
6 alongside the booking engine; it's noted here because it constrains how
`bookings` must be shaped (a `tstzrange` time column, not just separate
start/end columns) from the start.

## What's intentionally not decided yet

- Exact columns/data types per table — written as SQL in Phase 2
- RLS policy text per table — written alongside each migration in Phase 2
- Loyalty point rules (points per booking, tiers, rewards) — the brief says
  not to over-engineer this initially; `loyalty_transactions` gives room to
  add rules later without a schema change
