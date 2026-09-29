# SCCSC Staff App: mileage tracker

Internal staff app for the Sacramento Chinese Community Service Center. The first module replaces
the paper mileage spreadsheet: staff log trips from their phone, submit claims, coordinators
approve them, and finance batches and pays them, with a full history and no re-typing.

**Status:** working prototype with **fake data only**. See [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)
for the product brief, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works, and
[docs/DECISIONS.md](docs/DECISIONS.md) for why.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
```

No database or accounts to set up: it runs on a built-in Postgres (PGlite) saved in `.data/pglite`,
filled with fake demo data on first start. Delete `.data/` to start over.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the local demo database |
| `npm test` | Unit tests and database security tests (in-memory Postgres) |
| `npm run e2e` | End-to-end tests in a real browser (builds the app first) |
| `npm run typecheck` / `npm run lint` | Type-check / lint |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |

## Project map

```
src/
  app/                 pages (Next.js App Router)
  components/          UI building blocks in the sccsc.org style
  db/
    schema.ts          tables (Drizzle)
    index.ts           database connection, demo bootstrap and seeding
    with-user.ts       run queries as the signed-in user (Row Level Security)
    seed.ts            fake demo data
    demo-bootstrap.sql Supabase stand-ins for the demo database
  lib/                 money, phone, names, distance, request statuses
drizzle/               migrations (0001_security.sql: RLS, functions, triggers)
tests/                 unit + database tests (Vitest)
e2e/                   browser tests (Playwright)
docs/                  brief, architecture, decisions
assets/brand/          logo mark (copies served from public/brand/)
```
