# SCCSC Staff App: reimbursement tracker

Internal staff app for the Sacramento Chinese Community Service Center. The first module replaces
the paper mileage spreadsheet: staff log trips from their phone, submit them as a claim, their
coordinator approves it, and finance batches and pays it. Phone bills ($45 a month, claimed every
two months) go through the same steps. Every step is recorded, and nobody re-types anything.

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

The app opens with a short logo animation (once per browser tab; tap to skip). On the sign-in page,
pick a made-up person from the **Demo** dropdown and press **Explore** to skip the code.

1. **Rowan Ellery (employee).** The home page shows what's not submitted, waiting, approved
   and paid. Press **Log a trip**: pick Main office to Cedar Grove, tick Round trip, and the
   miles and amount fill in. Change the miles and it asks why. Choose direct or indirect, add any
   parking, and check the school (his usual one is filled in). Then **Submit trips**: tick the
   trips, confirm, submit. **Print** on a claim shows it laid out like the paper mileage voucher.
2. **Lena Fairbanks (coordinator).** **Review** lists her team's claims, oldest first. Open
   Rowan's claim: check the trips, then approve, or return it with a comment. Small claims with
   nothing flagged can be ticked and approved together.
3. **Rowan again.** The home page shows the update. The claim page shows the whole history:
   who did what, when, and why. The **Phone bill** card says his last two months are ready:
   press **Claim $90.00**, add a photo or PDF of the bill, confirm, and send it. It goes to Lena
   like a mileage claim, and she can open the bill before approving.
4. **Hazel Brightwater (finance).** **Finance** lists approved claims. Create a batch for the pay
   period. **Payments for Aplos** shows one payment per person, split by budget code
   (5702-200-211), with `MIL` and `CELL` labels in the memo. Download **Aplos payments (Excel)**
   for the Aplos register import, then mark the batch paid. **Reports** totals trips and phone
   bills by employee, district and school for any dates. Everything has a printable version.
5. **Sam Whitlock (admin).** **Admin** shows Nora Pennington waiting for access. She verified her
   email but isn't on the staff list. Approve her with a role and a coordinator. **Staff** adds,
   edits or imports people (try `tests/fixtures/staff-list-sample.csv`); **Budget codes** updates
   from the Aplos template and sets which account each kind of line goes to; **Rates and rules**
   and **History** do what they say.
6. **The real sign-in.** Sign out, then sign in as **Felix Hartwell, felix.hartwell@example.org**
   (or as yourself, **Eden Redona, eden.redona@sccsc.org**: you're on the staff list as an admin).
   He's on the staff list but has never signed in. The code appears on screen (no email is sent in
   the demo unless you set it up below). **Use phone number instead** signs in with his mobile,
   (916) 555-0108, to the same account. Any other name and email goes to the admin's approval queue.

| Demo person | Roles | Coordinator |
|---|---|---|
| Rowan Ellery, Tessa Quill | Employee | Lena Fairbanks |
| Marcus Holloway | Employee | Owen Castellano |
| Lena Fairbanks | Employee, coordinator | Owen Castellano |
| Owen Castellano | Employee, coordinator | none (an admin reviews) |
| Hazel Brightwater | Employee, finance | Owen Castellano |
| Sam Whitlock | Employee, admin | Owen Castellano |
| Felix Hartwell | Employee (on the roster, never signed in) | Lena Fairbanks |
| Eden Redona | Employee, admin (on the roster; sign in with your emailed code) | Owen Castellano |

All names, emails (example.org), phone numbers (555-01xx), addresses and amounts are made up,
except Eden's own entry. Tessa, Marcus, Lena and Rowan also have phone bill claims in different
states (waiting, approved, returned to fix, paid), each with a made-up sample bill (PDF).

## Real sign-in codes for the demo

By default the demo shows the sign-in code on screen. To see the real "we sent you a code" step
instead, the demo can send every code to you, whatever email or number is typed. You still sign in
as the person whose email or number you typed.

- **By email through Resend (free).** The email is styled like sccsc.org. With only this set up,
  codes for phone sign-in come to your inbox too, so the demo needs no texts.
- **By text through Twilio Verify (optional, costs money).** Only for phone sign-in. A trial works,
  then about $0.05 a text.

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

Then sign in with any name and email, for example Felix Hartwell, felix.hartwell@example.org. The
code comes from "SCCSC Staff" at `onboarding@resend.dev`; if the first one lands in spam, mark it
"not spam". Limits: 5 codes per email or number per hour and 20 in total per hour, well inside
Resend's free 100 emails a day. Once SCCSC verifies a domain in Resend (a subdomain of sccsc.org, for example), set
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

Then tap **Use phone number instead** and sign in with any name and number, for example Felix
Hartwell, (916) 555-0108. The code arrives on your phone, and you sign in as the person whose number
you typed. Email sign-in keeps using email. The demo dropdown still works
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
    sign-in/, pending/     email (or phone) + code sign-in, "waiting for approval"
    (app)/                 signed-in pages: home, trips, claims, phone bill, review, finance, admin, help
    print/                 printable claim and batch
  components/              UI building blocks in the sccsc.org style
    intro/                 the opening animation (the logo, once per browser tab)
  db/
    schema.ts              tables (Drizzle)
    index.ts               connection, demo bootstrap and seeding
    with-user.ts           run queries as the signed-in user (Row Level Security)
    seed.ts                fake demo data
    demo-bootstrap.sql     Supabase stand-ins for the demo database
  lib/
    auth/                  sessions, sign-in codes, roster matching, the signed-in viewer
    data/                  queries and actions per area (claims, trips, review, finance, admin)
    requests/              request types (mileage, phone bill periods), statuses, Aplos payments, exports
    distance/              miles between places (demo estimate until a maps service is chosen)
drizzle/                   migrations (0001_security.sql: RLS, audited transitions, locks)
tests/                     unit and database tests (Vitest)
e2e/                       browser tests (Playwright)
docs/                      brief, architecture, decisions
assets/brand/              logo mark and full logo (copies served from public/brand/)
```

## What's next

A walkthrough with the coordinators and program managers, then the real staff list, then Supabase
with real sign-in emails, a maps service for miles, notifications, and the installable app. See the
milestones in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
