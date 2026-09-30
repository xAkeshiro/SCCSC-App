# Decisions

Log of significant project decisions. Newest at the bottom.

| Date | Decision | Reason |
|---|---|---|
| 2026-09-29 | Build in-house instead of using Google Forms or a paid mileage app | Custom form system, room to grow into a staff app, fits SCCSC workflows |
| 2026-09-29 | One codebase that works as a website and an installable app | Same features everywhere, no app store needed to start |
| 2026-09-29 | Start as a responsive website; make it an installable app (PWA) later | Get the core workflow in front of the director first; the PWA adds little until then |
| 2026-09-29 | Prototype runs on a built-in database (PGlite) with fake data, using the same migrations and RLS policies as Supabase | $0 and no accounts to set up; deployable as a clickable demo; moving to Supabase is configuration, not a rewrite |
| 2026-09-29 | Next.js 16 + Tailwind 4 + Drizzle ORM | Same stack and versions as the main sccsc site, which Eden already maintains |
| 2026-09-29 | Trips are bundled into a claim when the employee is ready ("bundle when ready") | Mirrors the multi-trip spreadsheet without depending on the still-open pay-period cutoff |
| 2026-09-29 | Sign-in by phone number + text code. Roster match (name + phone) gets in right away; anyone else waits for an admin to approve after checking Paychex | Eden's call. Not all staff have work email, and payroll already has verified phone numbers |
| 2026-09-29 | Look follows the live sccsc.org landing page: Onest + Instrument Sans, `#1D1D1D` text, red-heart eyebrows, brush underline. EB Garamond kept only for the wordmark | Eden asked to match sccsc.org; the brief's fonts were stand-ins |
| 2026-09-29 | Status changes happen only through audited database functions; trips in submitted or later claims are locked by RLS and a trigger | "Audit everything" and "approved records are locked," enforced by the database rather than only the app |
| 2026-09-29 | Reviewers and finance see "Home" instead of a home address | Brief: trip addresses may include home addresses; limit who sees them |
| 2026-09-29 | Until a maps provider is chosen, miles are estimated from saved places (labeled as a demo estimate) or typed in | Provider and cost are still open; the estimate shows the workflow without committing to one |
| 2026-09-29 | The home-trip rule is a setting (allow / flag / block), starting at "flag for the approver" | Open question 3; don't guess the policy |
| 2026-09-29 | Nobody reviews their own claim. A coordinator's own claims go to their coordinator; admins can review anyone's claim as a fallback | Separation of duties; covers people without a coordinator and coordinators who are away (open question 5) |
| 2026-09-29 | Employees can withdraw a submitted claim before it's reviewed (it becomes a draft) | Fix a mistake without asking the coordinator to return it |
| 2026-09-29 | Bulk approval only for claims under a set total with nothing flagged (setting, $100 to start); the server re-checks | "Bulk approve for simple cases" without letting flagged trips slip through |
| 2026-09-29 | Batch export is two generic CSV layouts (trip detail, and totals per employee and program) until the financial system's import format is known. Downloading freezes the batch | Open question 1; freezing keeps the file and the batch in agreement |
| 2026-09-29 | Rules that are guesses live in the settings table: home trips, bulk approval limit, program required, session length, oldest trip | CLAUDE.md: don't guess business rules; make them configurable |
| 2026-09-30 | Real sign-in texts for the demo through Twilio Verify, with every code sent to Eden's phone (`DEMO_SMS_TO`) whatever number is typed | Shows the real text-message flow to the director without texting fake numbers. Verify needs no phone number or carrier registration, a trial account can text verified phones, and Supabase supports it later |
| 2026-09-30 | The demo can email sign-in codes through Resend (every code to Eden's inbox, `DEMO_EMAIL_TO`), in a themed HTML email. Email wins over Twilio when both are set | Free (Resend's free tier) where texts cost money. Staff still sign in by phone; email is only a demo channel |
