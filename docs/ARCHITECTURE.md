# Architecture Overview

This document explains the big decisions behind how this project is built,
in plain language. If you're new to software development, read this before
looking at any code.

## The big picture

Three pieces talk to one database:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Customer app    │     │  Employee mode    │     │  Admin dashboard    │
│  (phone, Expo)   │     │  (phone, Expo —   │     │  (web browser,      │
│                   │     │   same app as     │     │   Next.js)          │
│                   │     │   customer app)   │     │                     │
└─────────┬────────┘     └─────────┬─────────┘     └──────────┬──────────┘
          │                        │                            │
          └────────────────────────┼────────────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │      Supabase       │
                          │  (Postgres database, │
                          │   auth, file storage, │
                          │   realtime updates)   │
                          └──────────────────────┘
```

Nobody talks directly to a custom backend server we'd have to build and
host ourselves — Supabase *is* the backend. It gives us a real Postgres
database, login/signup, file uploads, and "live updates" (e.g. a queue
screen that updates instantly when someone's status changes) without us
writing and hosting that infrastructure by hand. The apps talk to Supabase
directly, with the database itself enforcing who can see and change what
(explained below in "Security").

## Why one Expo app for both customers and employees?

Two separate apps would mean building navigation, login, and design twice.
Instead, one app shows different screens depending on the logged-in user's
role — a customer sees booking screens, an employee sees shift/queue
screens. Less code to maintain, and it's still normal for an app to look
completely different once you're logged in versus browsing publicly.

## Why a monorepo (one repository, multiple apps)?

The admin dashboard and the mobile app need to agree on things like "what
roles exist," "what does a booking status mean," and "how do we say
'Cancel' in Arabic." Keeping the admin app and mobile app in one repository
with shared `packages/` folders means both apps import the *same* code for
those things — if we add a new booking status, we add it once, not twice.

```
/apps        ← the actual applications people open
/packages    ← code shared between those applications
/supabase    ← the database schema and demo data
```

## Why Supabase specifically?

- **Postgres**, a mature, correct relational database — good fit for data
  with lots of relationships (bookings → customers → employees → stations),
  which is most of this project.
- **Row Level Security (RLS)**: rules live *in the database itself*, so
  even if a bug exists in the app's code, the database still refuses to let
  a customer read another customer's booking, or an employee see another
  station's data. This matters a lot for a real business — see "Security."
- **Built-in Auth, Storage, Realtime** — login, photo uploads (feedback
  photos, complaint photos), and live queue updates come for free, instead
  of us building and hosting that ourselves.

## Why Next.js for the admin dashboard, Expo for mobile?

They're the standard, well-supported choice for each: Next.js for a
browser-based dashboard used at a desk, Expo/React Native for a
touch-first phone app used at a fuel pump or by a customer in a car. Both
use TypeScript and can share code through `packages/`.

## Security: never trust the app, always trust the database

A common mistake in apps like this: writing code like *"if user.role ===
'EMPLOYEE', show the button"* and assuming that's enough security. It
isn't — anyone can bypass app code. The real rule enforced in this project:

> Every role's permissions are enforced by Postgres Row Level Security
> policies (Phase 2), not just by hiding buttons in the app.

Hiding a button is still good UX (no point showing an action someone can't
take), but it is never the *only* thing standing between a user and data
they shouldn't see.

## Operating day / late-night bookings

The business wants to open until 3–4 AM. A booking at 2:30 AM on "Tuesday
night" is still part of Tuesday's business day, not Wednesday's — a manager
reviewing "Tuesday's bookings" the next morning expects to see it.

`bookings.time_range` stores a real, timezone-aware timestamp range (see
`docs/DATABASE_DESIGN.md`), so there's never any ambiguity about *when*
something happened. Attributing a booking to the right *business day* for
reporting (so "Tuesday's bookings" correctly includes that 2:30 AM one) is
a Phase 11 (Analytics & Reporting) concern — it can be computed from the
stored timestamp when needed, rather than requiring its own column now.

## Deviations from the originally suggested folder structure

- **No `packages/config` package.** The shared TypeScript settings are one
  JSON file (`/tsconfig.base.json` at the repo root) — wrapping that in its
  own package would add indirection with no benefit. See
  `packages/config/README.md`.
- **`packages/ui` exists but is empty** until Phase 3, when the admin
  dashboard's first real screen needs its first reusable component. Building
  a shared component library with no screens to use it in would be guessing
  at what it needs to look like.

## Phase plan

Building happens in phases; each one ends with something you can actually
run and test, per the project's development process. High-level sequence
(see the original project brief for full detail per phase):

0. Planning & architecture *(this doc)*
1. Repo setup, monorepo, tooling
2. **Supabase database, migrations, seed data, auth, RLS** ← you are here
3. Admin dashboard foundation + station management
4. Customer mobile app foundation (browse stations/services)
5. Employee mobile experience
6. Booking engine (the availability/scheduling logic)
7. Car wash bays + queue management
8. Feedback + complaints
9. Offers + notifications
10. Employee scheduling + night operations dashboard
11. Analytics & reporting
12. Testing, security review, production prep

Each phase stops for your review before the next one starts.
