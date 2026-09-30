# SCCSC Staff App

Internal staff app for the Sacramento Chinese Community Service Center (SCCSC).
It starts as a **reimbursement tracker** (mileage and phone bills) and will grow into a staff hub with
other reimbursement types and staff features over time.

Owner and solo developer: Eden Redona (Administrative Assistant, SCCSC).

Full product brief, requirements, and open questions: @docs/PROJECT_BRIEF.md
Architecture, data model, security model and milestones: @docs/ARCHITECTURE.md

## Current status

- Working prototype of the reimbursement tracker: mileage, and phone bills ($45 a month, claimed
  every two months). Website; the installable app/PWA comes later.
- Runs on a built-in database (PGlite) with **fake data only** until the director and finance
  sign off. Supabase, real sign-in emails and a maps provider come after that.
- Several business rules are still unconfirmed (see "Open questions" in the brief). Do not guess
  at these. Build them as configurable settings (the `settings` table) or ask Eden.

## How to work with Eden

- **Plan before code.** At the start of the project, read the brief, ask clarifying questions,
  then propose the architecture, data model, and phased milestones. Wait for approval before
  scaffolding.
- Build in **small vertical slices** that each run end to end (UI, API, database, tests).
- Explain tradeoffs briefly when there is a real choice to make. Eden is comfortable with
  Next.js, React, Tailwind, Supabase, and Vercel.
- Record significant decisions in `docs/DECISIONS.md` (date, decision, reason).
- Keep `docs/PROJECT_BRIEF.md` current when scope changes.

## Stack (confirmed 2026-09-29)

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4, same versions as the main sccsc site.
  Next 16 has breaking changes: read `node_modules/next/dist/docs/` before writing Next code
  (for example `proxy.ts` replaced middleware, and `params`/`cookies()` are async).
- Drizzle ORM. PGlite (built-in Postgres) for the demo and local dev; Supabase Postgres later.
  Same migrations and RLS policies on both.
- Sign-in: email + code by default, or "Use phone number instead" for a text code (texts cost
  money, so email comes first). Roster match (name + email or phone) gets in right away; anyone
  else waits for an admin to approve (checked against Paychex). One account per person holds both.
  Demo mode shows the code on screen, or sends every code to Eden: by email through Resend
  (`RESEND_API_KEY` + `DEMO_EMAIL_TO`), or phone codes by text through Twilio Verify (`TWILIO_*` +
  `DEMO_SMS_TO`).
- Deployed on Vercel: project `sccsc-app` (demo mode, fake data), from this repo's default branch.
- Later: installable **PWA** (same features as the site), SMS/email notifications, a
  maps/distance API (provider to be chosen, consider cost).

## Commands

- `npm run dev`: app at http://localhost:3000 with fake data saved in `.data/pglite`
  (delete that folder to reset). The sign-in page has a demo dropdown to sign in as anyone.
- `npm test`: unit tests and database security tests (in-memory Postgres).
- `npm run e2e`: Playwright end-to-end tests (builds the app, fresh demo database).
- `npm run typecheck`, `npm run lint`.
- `npm run db:generate` after editing `src/db/schema.ts`; policies, functions and triggers go
  in hand-written migrations (`npm run db:custom -- --name <name>`), one statement per
  `--> statement-breakpoint`.

## Architecture principles

- **Generic request engine, specific first module.** Model everything as a "request" of a
  "request type" (mileage and phone bills so far, other reimbursements later). Each type's
  specifics live in its request type (`src/lib/requests/`), not hard-coded across the app. Do NOT build a drag-and-drop form builder in
  phase 1; define request types in code or config.
- **Roles:** employee, coordinator (approver), finance, admin. One person can hold several.
- **Status flow:** draft → submitted → approved / returned / denied → batched → paid.
- **Audit everything.** Every status change stores who, when, and any comment. Approved
  records are locked; changes require returning the request.
- **Money and rates:** store amounts in integer cents. Reimbursement rates are effective-dated,
  and each entry stores the rate it was calculated with.
- **Security:** RLS on every table. Employees see only their own requests; coordinators see
  their assigned employees; finance and admin see what their role needs. Trip addresses can
  include home addresses, so treat them as personal data.
- Mobile first and accessible (WCAG 2.1 AA). Assume staff have a wide range of tech comfort.

## Rules

- Never commit secrets. Use `.env.local` and keep `.env.example` updated.
- Seed and test data must be fake. Never use real employee names, addresses, or amounts. The one
  exception is Eden's own demo roster entry (Eden Redona, eden.redona@sccsc.org), added at Eden's
  request so Eden can sign in to the demo with a real emailed code.
- Database changes go through migrations, never manual edits in the dashboard.
- App code reads and writes as the signed-in user through `withUser` (`src/db/with-user.ts`) so
  RLS applies. `withSystem` bypasses RLS and is only for the sign-in flow and seeding.
- Request status changes go through the `app.*` database functions, never direct updates.
- Keep dependencies lean; ask before adding large libraries.

## Brand

The look follows the live sccsc.org landing page (see `src/app/globals.css` for the tokens).

- Red `#D0112B` (hover `#A50E22`), text `#1D1D1D`, charcoal `#333333`, muted `#6B6B6B`, white,
  light gray sections `#F7F7F7`. Light red tint `#F3C4CB` for accents and the brush underline.
- Fonts: Onest for headings, Instrument Sans for text (both from sccsc.org). EB Garamond only for
  the lowercase "reimbursement tracker" wordmark (stand-in for the logo serif).
- Details from sccsc.org: red-heart eyebrows above headings, a pink brush stroke under one word
  of a heading, big red stat numbers, white cards with soft shadows, 8px button corners, dark
  top bar and footer.
- Logo mark (心 in a red square) is in `assets/brand/` (copies in `public/brand/`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
