# SCCSC Staff App: mileage tracker

Internal staff app for the Sacramento Chinese Community Service Center. The first module replaces
the paper mileage spreadsheet: staff log trips from their phone, submit them as a claim, their
coordinator approves it, and finance batches and pays it. Every step is recorded, and nobody
re-types anything.

**Status:** working prototype with **fake data only**. See [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
for the product brief and open questions, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it
works, and [docs/DECISIONS.md](docs/DECISIONS.md) for why.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
```

No database or accounts to set up: it runs on a built-in Postgres (PGlite) saved in `.data/pglite`,
filled with fake demo data on first start. Delete `.data/` to start over.

## Demo walkthrough (about 5 minutes)

On the sign-in page, pick a made-up person from the **Demo** dropdown and press **Explore** to skip the code.

1. **Rowan Ellery (employee).** The home page shows what's not submitted, waiting, approved
   and paid. Press **Log a trip**: pick Main office to Cedar Grove, tick Round trip, and the
   miles and amount fill in. Change the miles and it asks why. Then **Submit trips**: tick the
   trips, confirm, submit.
2. **Lena Fairbanks (coordinator).** **Review** lists her team's claims, oldest first. Open
   Rowan's claim: check the trips, then approve, or return it with a comment. Small claims with
   nothing flagged can be ticked and approved together.
3. **Rowan again.** The home page shows the update. The claim page shows the whole history:
   who did what, when, and why.
4. **Hazel Brightwater (finance).** **Finance** lists approved claims. Create a batch for the pay
   period, download the CSV for the financial system, then mark it paid. **Reports** totals trips
   by employee and program for any dates. Everything has a printable version.
5. **Sam Whitlock (admin).** **Admin** shows Nora Pennington waiting for access. She verified her
   phone but isn't on the staff list. Approve her with a role and a coordinator.
6. **The real sign-in.** Sign out, then sign in as **Felix Hartwell, (916) 555-0108**. He's on the
   staff list but has never signed in. The code appears on screen (no text is sent in the demo).
   Any other name and number goes to the admin's approval queue.

| Demo person | Roles | Coordinator |
|---|---|---|
| Rowan Ellery, Tessa Quill | Employee | Lena Fairbanks |
| Marcus Holloway | Employee | Owen Castellano |
| Lena Fairbanks | Employee, coordinator | Owen Castellano |
| Owen Castellano | Employee, coordinator | none (an admin reviews) |
| Hazel Brightwater | Employee, finance | Owen Castellano |
| Sam Whitlock | Employee, admin | Owen Castellano |
| Felix Hartwell | Employee (on the roster, never signed in) | Lena Fairbanks |

All names, phone numbers (555-01xx), addresses and amounts are made up.

## Real sign-in codes for the demo

By default the demo shows the sign-in code on screen. To see the real "we sent you a code" step
instead, the demo can send every code to you, whatever number is typed. You still sign in as the
person whose number you typed. Pick one:

- **By email through Resend (free).** The email is styled like sccsc.org.
- **By text through Twilio Verify.** A trial works, then about $0.05 a text.

If both are set up, email is used.

### By email (Resend, free)

1. Sign up at [resend.com](https://resend.com/signup) **with the email address that should get the
   codes**. Until a domain is verified, Resend only delivers to the address the account signed up
   with.
2. Open **API Keys → Create API Key**. Name it **sccsc-app demo**, choose **Sending access**, and
   copy the key (it starts with `re_` and is only shown once).
3. In Vercel, open **sccsc-app → Settings → Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `RESEND_API_KEY` | `re_…` (mark it Sensitive) |
   | `DEMO_EMAIL_TO` | the email you signed up with |

4. Redeploy (Deployments → ⋯ → Redeploy). For local dev, put the same lines in `.env.local`.

Then sign in with any name and number, for example Felix Hartwell, (916) 555-0108. The code comes
from "SCCSC Staff" at `onboarding@resend.dev`; if the first one lands in spam, mark it "not spam".
Limits: 5 codes per number per hour and 20 in total per hour, well inside Resend's free 100 emails
a day. Once SCCSC verifies a domain in Resend (a subdomain of sccsc.org, for example), set
`EMAIL_FROM` to send from it, like `SCCSC Staff <no-reply@staff.sccsc.org>`.

### By text (Twilio Verify)

A free trial account is enough to start, because a trial can text the phone numbers you verify
with Twilio.

1. Sign up at [twilio.com](https://www.twilio.com/try-twilio) and verify your own mobile number.
2. In the Twilio Console, open **Verify → Services → Create new**. Name it **SCCSC Staff** (the text
   says "Your SCCSC Staff verification code is: 123456") and turn on **SMS**. Copy the Service SID
   (starts with `VA`).
3. From the Console home page, copy the **Account SID** (starts with `AC`) and **Auth Token**.
4. In Vercel, open **sccsc-app → Settings → Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | `AC…` |
   | `TWILIO_AUTH_TOKEN` | the auth token (mark it Sensitive) |
   | `TWILIO_VERIFY_SERVICE_SID` | `VA…` |
   | `DEMO_SMS_TO` | your mobile, like `+19165551234` |

5. Redeploy (Deployments → ⋯ → Redeploy). For local dev, put the same lines in `.env.local`.

Then sign in with any name and number, for example Felix Hartwell, (916) 555-0108. The code arrives
on your phone, and you sign in as the person whose number you typed. The demo dropdown still works
without a code. Limits: 5 texts per number per hour and 20 in total per hour, on top of Twilio's own
limits. Twilio charges about $0.05 per verification, which the trial credit covers.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the local demo database |
| `npm test` | Unit tests and database security tests (in-memory Postgres) |
| `npm run e2e` | End-to-end tests in a real browser, desktop and phone (builds the app first) |
| `npm run typecheck` / `npm run lint` | Type-check / lint |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |

## Project map

```
src/
  app/
    sign-in/, pending/     phone + code sign-in, "waiting for approval"
    (app)/                 signed-in pages: home, trips, claims, review, finance, admin, help
    print/                 printable claim and batch
  components/              UI building blocks in the sccsc.org style
  db/
    schema.ts              tables (Drizzle)
    index.ts               connection, demo bootstrap and seeding
    with-user.ts           run queries as the signed-in user (Row Level Security)
    seed.ts                fake demo data
    demo-bootstrap.sql     Supabase stand-ins for the demo database
  lib/
    auth/                  sessions, sign-in codes, roster matching, the signed-in viewer
    data/                  queries and actions per area (claims, trips, review, finance, admin)
    requests/              request statuses, the mileage request type, CSV export layouts
    distance/              miles between places (demo estimate until a maps service is chosen)
drizzle/                   migrations (0001_security.sql: RLS, audited transitions, locks)
tests/                     unit and database tests (Vitest)
e2e/                       browser tests (Playwright)
docs/                      brief, architecture, decisions
assets/brand/              logo mark (copies served from public/brand/)
```

## What's next

Admin screens (roster import, roles and coordinators, rates, programs, settings), then Supabase
with real text messages and a Vercel deployment, a maps service for miles, notifications, and the
installable app. See the milestones in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
