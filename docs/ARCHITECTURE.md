# Architecture

How the staff app is put together, and why. Decisions are logged in [DECISIONS.md](DECISIONS.md);
the product brief is [PROJECT_BRIEF.md](PROJECT_BRIEF.md).

## Overview

```
Browser (phone or desktop)
   │  pages rendered on the server, forms posted to server actions
   ▼
Next.js 16 app (Vercel)
   │  every query runs inside withUser(): role "authenticated" + the user's id in request.jwt.claims
   ▼
Postgres
   ├─ demo / local: PGlite (Postgres in WebAssembly) + src/db/demo-bootstrap.sql
   └─ later:        Supabase Postgres (auth.uid() and roles are built in)
      Row Level Security on every table, status changes through app.* functions,
      locks and totals kept by triggers, append-only history.
```

- **No client-side database access.** Pages read data in server components; forms call server
  actions. The browser never holds database credentials.
- **The database enforces the rules**, not only the app. Even if app code had a bug, an employee
  couldn't read someone else's trips, approve their own claim, or change an approved trip.

## Modes

| Mode | When | Database | Sign-in codes |
|---|---|---|---|
| Local dev | `npm run dev`, no `DATABASE_URL` | PGlite saved in `.data/pglite` | shown on screen |
| Demo | on Vercel without `DATABASE_URL`, or `DEMO_MODE=true` | PGlite in memory, reseeded on start | shown on screen |
| Production (later) | `DATABASE_URL` set | Supabase Postgres | text message (Supabase Auth) |

Local dev and the demo seed fake data on first start and show a "Demo, fake data only" banner.
The demo also lists the demo people on the sign-in page so the director can click through every
role.

## Generic requests, specific first module

Everything is a **request** (a claim) of a **request type**, made of **request items**.

- `request_types` has one row today: `mileage`. Adding another reimbursement type means a new row,
  a details table like `mileage_details` if it needs typed fields, and a module in
  `src/lib/requests/` for its form, validation and calculation.
- Status flow and approvals (`app.*` functions), history, batching and payment are shared by all
  types.
- No form builder yet (the brief says to wait until several types exist).

## Data model

| Table | What it holds |
|---|---|
| `staff` | A staff member: name, active/inactive, coordinator, default program. `user_id` links their sign-in account once they have signed in. |
| `staff_private` | Phone number (E.164). Admins only. |
| `staff_roles` | employee, coordinator, finance, admin. A person can hold several. |
| `staff_state` | Per-person state they may change themselves (when they last read their updates). |
| `access_requests` | People who verified a phone but didn't match the roster, waiting for an admin. |
| `programs` | Program or grant codes trips are charged to. |
| `request_types` | `mileage` (more later). |
| `rates` | Effective-dated rates in cents per unit (`numeric`, so 72.5¢ is exact). |
| `settings` | Business rules still being decided (home trips, bulk approval limit, session length). |
| `saved_places` | Shared places (office, school sites) and personal ones (Home). |
| `requests` | A claim: owner, status, total (kept by trigger), submitted/decided times, batch. |
| `request_items` | A trip: date, purpose, program, notes, amount in cents. `request_id` is empty until it is submitted. |
| `mileage_details` | Trip route (from, stops, to), round trip, estimated and claimed miles, override reason, and the **rate it was calculated with**. |
| `request_events` | The history: who did what, when, from which status to which, and their comment. Append-only. |
| `batches` | A pay-period batch: claims, total, exported and paid dates. |
| `trip_view` (view) | Trips with their details, with home addresses hidden from anyone but the owner. |

Money is integer cents everywhere. Each trip stores its own rate and rounded amount, so a later rate
change never alters a submitted claim. A claim's total is the sum of its trips.

## Security model

Every table has Row Level Security. The app connects as the table owner, then for each signed-in
request runs `set local role authenticated` and puts the user's id in `request.jwt.claims`
(`src/db/with-user.ts`). That is exactly how Supabase evaluates policies for a logged-in request,
so the same policies work in the demo and in production, and the tests exercise them for real.

Who sees what:

| | Own trips and claims | Team's claims | Everyone's claims | Phone numbers | Home addresses |
|---|---|---|---|---|---|
| Employee | ✓ | | | | own only |
| Coordinator | ✓ | ✓ (once submitted) | | | own only |
| Finance | ✓ | | approved, batched, paid | | own only |
| Admin | ✓ | | all but drafts | ✓ | own only |

- **Status changes** only happen through `SECURITY DEFINER` functions in schema `app`
  (`submit_claim`, `withdraw_claim`, `resubmit_claim`, `decide_claim`, `create_batch`,
  `add_to_batch`, `remove_from_batch`, `mark_batch_exported`, `mark_batch_paid`). Each checks who is
  asking, allows only valid transitions, and writes a `request_events` row. Signed-in users have no
  `UPDATE` privilege on `requests` or `batches`.
- **Nobody reviews their own claim.** A coordinator's own claims go to their coordinator. People
  without a coordinator are reviewed by an admin.
- **Locks.** Trips can change only while unsubmitted or while their claim is a draft or returned.
  RLS hides locked trips from edits, and a trigger stops even owner-level code.
- **History is append-only.** A trigger rejects any update or delete on `request_events`.
- `withSystem` (owner rights, no RLS) is used only by the sign-in flow, before someone is a
  known staff member, and by the seed. It plays the role of Supabase's service key.

The rules are tested in `tests/db/security.test.ts`.

## Sign-in

1. The person enters their full name and mobile number.
2. A 6-digit code is sent. In demo mode it is shown on screen; later Supabase Auth texts it.
   Codes expire after 10 minutes, allow 5 tries, and each number can request a few per hour.
3. With the right code, their phone is verified:
   - **On the roster, name matches** → linked to their staff record and signed in.
   - **Not on the roster, or the name differs** → an access request is created, and they see
     "waiting for approval" until an admin approves them (checking Paychex) or rejects them.
4. The session is a signed, http-only cookie lasting `session_days` (a setting, 30 to start).

## Distance

`src/lib/distance` defines a `DistanceProvider`. The demo provider estimates road miles from
straight-line distance between saved places with coordinates (×1.25) and is labeled "Estimate
(demo)". Typed addresses have no estimate, so the person enters miles. Changing an estimate needs a
reason, which the approver sees. A real provider (Google Routes, Mapbox or OpenRouteService) will
replace it, with results cached.

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Foundation: docs, scaffold, design system, database + RLS, seed, tests | done |
| M1 | Sign-in with phone + code, roster match, access requests, demo people | done |
| M2 | Log, edit and delete trips; saved places; miles and amount | done |
| M3 | Submit claims, claim history, return and resubmit, updates, printable claim | done |
| M4 | Coordinator review: approve, return, deny, bulk approve | done |
| M5 | Finance: batches, CSV export, mark paid, printable batch, simple report | done |
| M6 | Admin: roster import, roles and coordinators, rates, programs, settings, audit view | later |
| M7 | Supabase + real text messages, then deploy to Vercel | later |
| M8 | Maps provider and notifications | later |
| M9 | Installable app (PWA), offline trip drafts | later |
| M10 | Second request type | later |

## Moving to Supabase (M7, outline)

1. Create dev and production Supabase projects; set `DATABASE_URL` (pooler, port 6543) and
   `SESSION_SECRET` in Vercel.
2. Run the migrations in `drizzle/` against it (a `db:migrate` script). `demo-bootstrap.sql` is not
   used: Supabase already has `auth.users`, `auth.uid()` and the roles.
3. Turn on Phone sign-in in Supabase Auth with an SMS provider, and swap the demo code provider in
   `src/lib/auth/` for Supabase's `signInWithOtp` / `verifyOtp`.
4. Import the real roster through the admin screen (M6), never the seed.
