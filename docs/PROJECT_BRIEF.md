# Project Brief: SCCSC Staff App

Working name. First module: Reimbursement Tracker (mileage, then phone bills).

## 1. Background

The Sacramento Chinese Community Service Center (SCCSC) reimburses staff for business mileage.
The current process is manual and paper based:

1. The employee fills out a mileage spreadsheet template.
2. Their coordinator reviews and approves it.
3. The filled spreadsheet is printed and handed to the finance team.
4. Finance re-types the information into the organization's financial system.

Reimbursements happen roughly every week or two. There is no hard submission deadline, which is fine.

### Problems with the current process

- The same information is handled four times, and two of those steps only move paper.
- Re-typing creates typos and math errors.
- Employees can't easily see whether their mileage was approved or paid.
- Everyone looks up distances and calculates totals themselves, not always consistently.

## 2. Vision

One internal app, usable as a website or an installed phone app with the same features, that:

- Starts as a reimbursement tracker: mileage first, then phone bills.
- Grows into a staff hub: other reimbursement types first, then other staff features.
- Is built in-house (not a purchased SaaS tool) so it fits SCCSC's programs, approval chain, and
  pay cycles, and can be changed without waiting on a vendor.
- Does not use continuous GPS tracking of staff.

## 3. Users and roles

| Role | What they do |
|---|---|
| Employee | Logs trips, submits claims, tracks status |
| Coordinator | Reviews and approves, returns, or denies their team's claims |
| Finance | Batches approved claims, enters them in Aplos as payments, marks paid, runs reports |
| Admin | Manages staff, roles, reviewers, rates, budget codes and the open rules |

A person can hold more than one role (for example, a coordinator is also an employee).

### Who's who at SCCSC (from Eden, 2026-10-01)

The President, the CFO and the Fiscal Operations Manager approved the project and gave the green
light to build. SCCSC's structure for this project, from the top (most of the executive team is
left out):

| Group | People | In the app |
|---|---|---|
| Finance team | Andrew (CFO), Stef (Fiscal Operations Manager), and for now Eden Redona (Administrative Assistant, who assists them and works on company solutions) | Finance. Eden and Stef are also the admins (2026-10-02). |
| Coordinators | Sr. Program Manager, Program Managers. Assistant Program Managers aren't included for now. | Coordinator: reviews their team's claims |
| Team leads | Sr. Team Lead, Team Lead | Still open whether they review claims (open question 5) |

Everyone, at every level, logs their own trips and phone bills as an employee.

## 4. Phase 1: Mileage Tracker (MVP)

### Employee

- Log trips from a phone right after driving, or in bulk later from a desktop.
- Trip fields: date, start location, end location, optional extra stops, round trip toggle,
  business purpose, **direct or indirect**, **school or site**, **parking paid**, notes. Direct,
  indirect, school and parking come from the paper form, `Mileage_Claim_2026.xlsx` (2026-10-02):
  direct is directly involved with students (buying materials, a tournament); indirect is
  meetings, trainings, and picking up or dropping off materials at the Ping office.
- On submitting, the employee also certifies (from the paper form) that they have a valid driver's
  license and vehicle coverage and obey traffic laws.
- Miles calculated automatically from the addresses. Allow a manual override with a required reason.
- Saved places (main office, frequent sites) for fast entry.
- Group trips into a claim and submit it (mirrors the current spreadsheet, which covers
  multiple trips). **Confirmed 2026-09-29: "bundle when ready."** Trips are logged any time;
  "Submit" bundles the unsubmitted ones into one claim, and any can be left out for later.
- See each claim's status: draft, submitted, returned, approved, denied, batched, paid.
- Get notified when a claim is approved, returned, or paid.

### Coordinator

- Queue of claims waiting for their review.
- Approve, return with a comment, or deny. Bulk approve for simple cases.
- Each decision is logged with name and timestamp. This replaces the wet signature.

### Finance

- Queue of approved claims.
- Create a batch for a pay period, turn it into Aplos payments (see "Budget codes and Aplos"
  below), and mark the batch paid.
- Reports by employee, district, school or site, and date range.
- Printable summary of a claim or batch, for audits and the transition period.

### Admin

- Manage staff accounts, roles, and which coordinator approves each employee. Add people one at a
  time or import the staff list (a Paychex export).
- Keep the budget codes in step with Aplos (import Aplos's register import template).
- Manage the mileage rate as effective-dated values (the IRS rate changes periodically).
- Settings for business rules that are still open (see section 8).

### Budget codes and Aplos (from Eden, 2026-10-02)

SCCSC's accounting system is **Aplos** (answers open question 1). Finance (Eden and Stef) enters
approved reimbursements in the Aplos bank register as **payments**.

- **Budget codes** are ACCOUNT-FUND-SCHOOL, for example **5430-200-211**: 5430 is the account (what
  the cost is: Telephone, indirect), 200 is the fund (the school district: Twin Rivers), and 211 is
  the school in that district (an Aplos "Schools" tag). The lists come from Aplos's register import
  template, which an admin uploads.
- Trips go to the mileage account for their direct or indirect choice (5702 direct, 5700 indirect),
  parking to the parking accounts (5703, 5701), and phone bills to 5430. Admins can change these.
- **One payment per person** per batch, with a split per budget code. The memo lists a label for
  each claim, and each split's comment is its label:
  - `MIL` + the date of the claim's last trip: `MIL062926`.
  - `CELL` + the last day of the two-month phone period: `CELL083126` is July–August,
    `CELL103126` is September–October.
  - `REIMB` for itemized reimbursements (supplies, consumables; direct or indirect). The template
    comes later.
  - A person paid for all three gets a memo like `MIL092526, CELL103126, REIMB092826`.
- The app shows each payment the way Aplos does and downloads them as an Aplos register import
  (Excel): Date, Note/Memo, Payee, Check #, Account, Fund, Comment, Amount, Tags: Schools.

### Records

- Every claim must capture what the IRS expects under an accountable plan: date, destination,
  business purpose, and miles.
- Full audit trail of every status change.
- Approved records are locked. Changes require returning the claim to the employee.

### Sign-in (confirmed 2026-09-29, email first since 2026-09-30)

Staff sign in with their **email and a code** sent to it (no passwords). Anyone who'd rather use
their phone taps **"Use phone number instead"** and gets a **text message code**. Email is the
default because email codes are free, while texts cost money per message and aren't budgeted yet.

1. Admin imports a staff roster (full name, email and mobile number, from payroll). When someone
   signs in and their full name and email (or phone) match a roster entry, they are in as soon as
   they enter the code. Email and phone lead to the same account.
2. Anyone who doesn't match verifies their email or phone, then waits in an **access request**
   queue. The admin checks their name against that email or phone number in Paychex and approves
   (setting their roles and coordinator) or rejects, usually within a day or two.

Staff stay signed in on their device for a set time (a setting, 30 days to start) so they rarely
need a new code.

### Phone bill reimbursement (added 2026-09-30)

The second reimbursement type, built on the same claims, approval, batch and payment flow as
mileage.

- SCCSC pays **$45 a month** for using a personal phone for work (an effective-dated rate, like the
  mileage rate).
- It's claimed **every two months, in the even months** (February, April, June, August, October,
  December), so a normal claim covers two months: **$90**. The months per claim is a setting.
- The employee opens **Phone bill**, checks the months (both are ticked; untick one, for example
  before they started), **adds a photo or PDF of the bill** (required, confirmed 2026-09-30),
  picks the school or site, confirms, and sends it. Their coordinator can open the bill, approves it like
  a mileage claim, and finance pays it in the same batches.
- Photos are made smaller on the phone before they're sent (a readable ~2000px JPEG). Up to 5 files
  per claim, 4 MB in all. Only photos (JPG, PNG, WebP, iPhone HEIC) and PDFs are accepted.
- Each person can claim a month only once. A returned claim can drop a month, or swap the bill for
  a clearer copy, and be resubmitted.
- Missed a period? The one before the latest can still be claimed (a setting).

## 5. Future phases (ideas, not committed)

### Agreed direction (2026-09-30), to plan after the current work

The goal is a central place staff open often, not only a reimbursement portal.

1. **Staff home base.** Announcements from the director or HR, with "I've read this" confirmations
   for policy changes (and a list of who hasn't). A searchable documents and forms library
   (handbook, policies, emergency procedures, forms). Quick links to what staff already use
   (Paychex Flex, benefits, email, shared drives). A calendar (holidays, pay dates, reimbursement
   deadlines, trainings).
2. **More requests on the same approval flow**, each a new request type: out-of-pocket purchases
   with a receipt photo, parking and tolls on trips, approval before spending (purchases, trainings,
   conferences), vehicle, equipment or key sign-out and return, and IT or building problem reports.
3. **Required trainings and documents, managed by Recruitment staff.** They assign what each person
   needs (for example mandated reporter training, CPR and first aid, a TB test, Live Scan clearance,
   and a driver's license and car insurance for anyone claiming mileage), track what's done and
   when it expires, and remind people. Staff upload their certificates. Needs a new Recruitment (or
   HR) role.
4. **Email reminders through Resend, controlled by Recruitment staff**: what's sent, to whom and
   when (for example "Your CPR card expires in 30 days", "Phone bill claims open October 1").
   Needs a verified sending domain (open question 17).
5. **Other languages** (to propose): the app in the languages staff read most comfortably (open
   question 7).
6. **Paychex, linked rather than duplicated.** Paychex stays the source for people and pay. First,
   links ("My pay": pay stubs, W-2s, time off, benefits). Then, with Paychex API access, a nightly
   staff-list sync (new hires can sign in; people who leave lose access) and "Send to payroll" for
   approved reimbursements, if they're paid on the paycheck (open question 22).

### Not planned (decided 2026-09-30)

- **New-hire onboarding** stays in Paychex, which SCCSC already uses for it. The app picks up after
  hire (for example, required trainings).
- **Timekeeping** (hours and timecard approval) is set aside. Paychex can take approved hours from
  another app, but California overtime, break and record rules make it a large project of its own.
  Revisit only after the questions in open question 23 are answered.
- Copying what Paychex already does (pay stubs, W-2s, benefits enrollment), storing sensitive HR
  records (medical details, Social Security numbers), and location tracking.

### Other ideas

- A config-driven form builder for admins, only once several request types exist and the
  patterns are clear.
- App store versions, only if the PWA is not enough.

## 6. Technical direction (proposed, confirm during planning)

- Next.js (App Router), TypeScript, Tailwind CSS.
- Supabase for Postgres, Auth, Storage, and Row Level Security. Separate dev and production projects.
- Vercel hosting.
- **Website first** (decided 2026-09-29). Then the PWA: web manifest, icons from `assets/brand/`,
  offline-friendly trip drafting if reasonable.
- Email notifications through a transactional email provider.
- Distance calculation and address autocomplete through a maps API. Compare providers on cost
  and accuracy, cache results, and keep API keys server-side.
- Sign-in: email + code by default, or phone number + text code, with roster matching (see
  "Sign-in" in section 4). Supabase Auth supports email codes (free; it can send through Resend
  once SCCSC verifies a domain) and phone codes through an SMS provider (Twilio, MessageBird or
  Vonage), which costs a little per text.

### Suggested data model direction

- `profiles` (user, name, roles, assigned coordinator, active)
- `request_types` (mileage first; later others)
- `requests` / claims (type, owner, status, period, totals)
- `request_items` / trips (belongs to a request; mileage-specific fields or a typed JSON payload)
- `approvals` and `audit_log` (actor, action, comment, timestamp)
- `rates` (type, value, effective_from)
- `funds`, `accounts` and `sites` (budget codes, from Aplos)
- `batches` (pay period, status, export file, paid date)
- `saved_places`

This is a starting point for discussion, not a final schema.

## 7. Non-functional requirements

- Mobile first. Works well on older phones and slow connections.
- Accessible (WCAG 2.1 AA): real buttons and labels, good contrast, large touch targets.
- Simple language in the UI. Staff have a wide range of tech comfort.
- Privacy: trip addresses may include home addresses, and phone bills can show personal details
  (numbers called, home address). Limit who can see them.
- Row Level Security on every table.
- Fake data only in development and demos.

## 8. Open questions (do not guess; ask Eden or make configurable)

1. ~~Which financial system does finance use, and what import format does it accept?~~
   **Decided:** Aplos, through its register import (Excel). See "Budget codes and Aplos".
2. Will finance and the auditor accept timestamped electronic approvals in place of signatures?
   Do any funders have specific documentation rules?
3. How should trips that start from home be handled (commute miles are generally not reimbursable)?
4. Exact reimbursement cadence and any cutoff for a given pay period.
5. How coordinator assignments work (by employee, by department, delegation when someone is out).
   Coordinators are the Sr. Program Manager and Program Managers (2026-10-01). Still open: do the
   Sr. Team Lead and Team Leads review their team's claims, or does every claim go to a Program
   Manager? And who covers when a reviewer is out?
6. ~~Does SCCSC use Google Workspace for staff accounts?~~ **Decided:** email + code (or phone
   number + text code), with roster matching and admin approval (see section 4).
7. Does the app need languages besides English? (Planned to propose later, 2026-09-30: which
   languages, and for Chinese, which script?)
8. How long must records be kept?
9. Does IT or leadership need to approve hosting staff data on Supabase and Vercel?
10. ~~Is one claim per pay period right, or should each trip be submitted on its own?~~
    **Decided:** bundle when ready (see section 4).
11. New: which payroll export will the roster come from (Paychex report columns)? Does it have
    staff emails, and should the roster store work or personal emails and mobile numbers?
12. New: if phone sign-in stays, which SMS provider, and is the per-text cost approved? (Texts
    aren't budgeted for now, so email is the default. Twilio Verify is about $0.05 per sign-in.)
13. New: how old can a trip be when it's logged? (A setting, 365 days to start.)
14. New: is the wording employees confirm when they submit right? ("These trips were for SCCSC
    business, in my own vehicle, and the dates, places and miles are correct. My normal commute
    is not included.") Finance or the auditor should approve it.
15. New: amounts are rounded to the cent per trip, and the claim total is the sum. Is that how
    finance wants it, or should rounding happen once per claim?
16. New: which claims can be approved in bulk? (A setting: under $100 with nothing flagged.)
17. New: sending sign-in emails to staff (not just the demo inbox) needs a domain verified with the
    email provider, for example `staff.sccsc.org`. Who manages sccsc.org's DNS?
18. New (phone bills): is every staff member eligible, or only some roles or programs?
19. ~~New (phone bills): does finance need a copy of the bill?~~ **Decided:** yes, a photo or PDF
    of the bill is required with every phone bill claim. Still open: must the bill show the
    employee's name and the months claimed, and how long are bill copies kept (see question 8)?
20. New (phone bills): how late can a missed period be claimed? (A setting: one period back.)
21. New (phone bills): is the confirmation wording right? ("I confirm I used my own phone for SCCSC
    work during these months.") And which school or site should phone bills be charged to? (The
    employee picks; it starts on their usual one.) Are they always 5430 Telephone (Indirect)?
22. New (Paychex, for later): are reimbursements paid on the paycheck or by a separate check? Which
    Paychex plan does SCCSC have, does it include API access (and at what cost), and who is the
    Paychex Flex Super Admin? Does Paychex hold staff work emails and mobile numbers?
23. New (timekeeping, set aside): do staff use Paychex Flex Time today, are most staff hourly
    (non-exempt), and who approves timecards now?
24. New (trainings tracker, for later): which trainings and documents are required for which roles,
    who are the Recruitment staff, and what should they be able to see (certificates can be
    personal)?
25. New (Aplos): when the register import has several rows with the same date, payee and check
    number, does Aplos make one payment with splits (like the screenshot), or separate payments?
    Worth a test import of one small batch. And do these payments get check numbers (the download
    can number them), or are they direct deposits?
26. New (Aplos): are the account choices right? Mileage direct 5702, indirect 5700; parking direct
    5703, indirect 5701; phone bills 5430. (Admin → Budget codes can change them.)
27. New (REIMB, for later): which date goes in the `REIMB` label, the last receipt's date or the
    day it was submitted?

## 9. Rollout plan

The prototype is built and approved by the President, the CFO and the Fiscal Operations Manager
(recorded 2026-10-01).

1. ~~Finish the admin tools (M6), so the app is fully working and set up the way SCCSC runs.~~
   Done 2026-10-02, with budget codes and Aplos payments. Eden fills in the real staff list.
2. Walk the coordinators and program managers through it with fake data, and work in their feedback.
3. Go-live setup (M7): Supabase, sign-in emails from an SCCSC address, the real staff list.
4. Pilot with one program for a pay cycle or two, keeping paper as a backup.
5. Everyone switches, with a short how-to for staff, and the paper forms retire.

## 10. Brand

- Colors: SCCSC red `#D0112B`, charcoal `#333333`, white, light red tint `#F3C4CB`. From the
  live sccsc.org theme: text `#1D1D1D`, hover red `#A50E22`, muted `#6B6B6B`, section gray.
- Type (updated 2026-09-29 to match sccsc.org): Onest for headings, Instrument Sans for UI text.
  EB Garamond for the wordmark and for "thecenter" in the opening animation (the logo's serif).
- Logo: the 心 mark in a red square, traced to vector from the SCCSC logo, in `assets/brand/`:
  - `thecenter-logo.svg`: the full "thecenter / sacramento chinese community service center" logo,
    traced to vector from the original artwork (2026-09-30). Used on printed claims and batches and
    in the opening animation
  - `xin-mark-square.svg`: red square with white 心 (matches the official logo)
  - `xin-mark-rounded.svg`: rounded corners, for app icons and the PWA manifest
  - `xin-glyph-white.svg`: the white 心 alone, for placing on red backgrounds
  - `app-icon.png`: the app icon (心 mark with a location pin badge), used for the browser tab and
    phone home screen (`src/app/icon.png`, `src/app/apple-icon.png`, and `public/brand/app-icon-*.png`
    for the installable app later)
- Wordmark style (renamed 2026-09-30): lowercase, small charcoal "reimbursement" next to a larger red "tracker",
  echoing the "thecenter" logo.
- Opening animation (added 2026-09-30): the full logo on white. The red seal, with the logo's thin
  white inner line, stamps in at its place on the left, 心 is written stroke by stroke, then
  "thecenter" and the name follow, and it fades into the app, in about 3 seconds.
  It plays once when the app is opened in a browser tab, a tap skips it, and it never plays for
  people whose device is set to reduce motion (`src/components/intro/`). "thecenter" is set in EB
  Garamond (the logo's typeface) and the "sacramento chinese / community service center" lines in
  Instrument Sans (the app's text font) so they're easy to read, both placed as in the original
  logo; the logo file itself keeps the original lettering.
