/**
 * Database access.
 *
 * - DATABASE_URL set          -> hosted Postgres (Supabase), migrated by `npm run db:migrate` (later milestone).
 * - DEMO_MODE=true or Vercel  -> in-memory PGlite, bootstrapped + migrated + seeded on first use.
 * - otherwise (npm run dev)   -> PGlite saved in .data/pglite, bootstrapped + migrated + seeded on first use.
 *
 * App code never queries the database directly as the owner. It goes through `withUser`
 * (./with-user.ts), which switches to the `authenticated` role so Row Level Security applies.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Where `npm run dev` keeps its embedded Postgres when DATABASE_URL is unset. */
export const LOCAL_DB_DIR = ".data/pglite";

export function hasHostedDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** In-memory demo database: deployed without DATABASE_URL, or forced with DEMO_MODE=true. */
export function isInMemoryDemo() {
  if (hasHostedDatabase()) return false;
  return Boolean(process.env.VERCEL) || process.env.DEMO_MODE === "true";
}

/** True whenever the app runs on fake data (anything but a hosted database). */
export function isDemoData() {
  return !hasHostedDatabase();
}

/**
 * postgres.js client for a hosted database. TLS for anything but a local server, and
 * `prepare: false` so it works through Supabase's transaction pooler (port 6543).
 */
export function createPostgresClient(url: string, options: postgres.Options<Record<string, never>> = {}) {
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return postgres(url, { prepare: false, ssl: local ? false : "require", ...options });
}

/** Wraps a PGlite instance in Drizzle. The PGlite and postgres-js clients share the query-builder API. */
export function drizzleFromPglite(client: PGlite): Database {
  return drizzlePglite(client, { schema }) as unknown as Database;
}

export function openLocalPglite() {
  mkdirSync(LOCAL_DB_DIR, { recursive: true });
  return new PGlite(LOCAL_DB_DIR);
}

type DbGlobals = { __staffDb?: Database; __staffPglite?: PGlite; __staffDbReady?: Promise<void> };
const globalForDb = globalThis as unknown as DbGlobals;

function createDatabase(): Database {
  const url = process.env.DATABASE_URL?.trim();
  if (url) return drizzlePostgres(createPostgresClient(url), { schema });
  const client = isInMemoryDemo() ? new PGlite() : openLocalPglite();
  globalForDb.__staffPglite = client;
  return drizzleFromPglite(client);
}

/** One client per process (and it survives dev hot reloads). */
function getRawDb(): Database {
  globalForDb.__staffDb ??= createDatabase();
  return globalForDb.__staffDb;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const BOOTSTRAP_FILE = path.join(process.cwd(), "src/db/demo-bootstrap.sql");

/**
 * Prepares a PGlite database: the Supabase stand-ins, every migration, then fake seed data if
 * the database is empty. Used by the app (demo/local) and by the tests.
 */
export async function preparePglite(client: PGlite, { seed = true }: { seed?: boolean } = {}) {
  await client.exec(readFileSync(BOOTSTRAP_FILE, "utf8"));
  const db = drizzleFromPglite(client);
  await migratePglite(db as never, { migrationsFolder: MIGRATIONS_FOLDER });
  if (seed) {
    const { seedIfEmpty } = await import("./seed");
    await seedIfEmpty(db);
  }
  return db;
}

/** Resolves once the database can serve queries. */
export function ensureDbReady(): Promise<void> {
  globalForDb.__staffDbReady ??= (async () => {
    getRawDb();
    const client = globalForDb.__staffPglite;
    if (client) await preparePglite(client);
  })().catch((err) => {
    // Allow a retry on the next request rather than caching the failure forever.
    globalForDb.__staffDbReady = undefined;
    throw err;
  });
  return globalForDb.__staffDbReady;
}

/** The ready database, as its owner. Only for ./with-user.ts and server-side system tasks. */
export async function getDb(): Promise<Database> {
  await ensureDbReady();
  return getRawDb();
}

export { schema };
