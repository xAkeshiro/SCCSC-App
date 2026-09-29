/**
 * Run queries as a signed-in user, so Row Level Security applies exactly as it will on Supabase.
 *
 * Inside the transaction we switch to the `authenticated` role and put the user's id in
 * request.jwt.claims, which is what `auth.uid()` reads. Every policy in drizzle/0001_security.sql
 * then sees the same thing it would see for a Supabase request carrying that user's JWT.
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb, type Database, type Tx } from "./index";

export async function withUserOn<T>(db: Database, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`,
    );
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

/** Queries as the signed-in user `userId` (an auth user id). */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUserOn(await getDb(), userId, fn);
}

/**
 * Queries as the table owner, bypassing Row Level Security. Only for trusted server-side steps
 * that happen before someone is a known staff member (the sign-in flow) and for seeding.
 * Equivalent to Supabase's service role.
 */
export async function withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

/** Rows from a raw SQL query, whichever driver is underneath. */
export async function rows<T>(tx: Tx | Database, query: SQL): Promise<T[]> {
  const result = (await tx.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

/** A Postgres uuid[] literal for passing lists of ids to the app.* functions. */
export function uuidArray(ids: string[]): SQL {
  if (ids.length === 0) return sql`'{}'::uuid[]`;
  return sql`array[${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
}

type PgErrorLike = { code?: string; message?: string; cause?: unknown };

function pgError(err: unknown): PgErrorLike | null {
  let current: unknown = err;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const e = current as PgErrorLike;
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e;
    current = e.cause;
  }
  return null;
}

/**
 * The message to show a person when a database call fails. Our own checks (in app.* functions
 * and triggers) raise plain-language messages with known codes; anything else gets a generic one.
 */
export function userMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = pgError(err);
  if (!e) return fallback;
  // 22023 invalid_parameter_value, 42501 insufficient_privilege, 23514 check_violation (locks).
  if (["22023", "42501", "23514"].includes(e.code ?? "") && e.message) {
    if (e.code === "42501" && /permission denied|row-level security/i.test(e.message)) {
      return "You don't have permission to do that.";
    }
    if (e.code === "23514" && /violates check constraint/i.test(e.message)) return fallback;
    return e.message;
  }
  return fallback;
}
