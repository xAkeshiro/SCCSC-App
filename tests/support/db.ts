import { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import { preparePglite, type Database, type Tx } from "@/db";
import { rows, withUserOn } from "@/db/with-user";
import { DEMO } from "@/db/seed";

export type TestDb = { db: Database; close: () => Promise<void> };

/** A fresh in-memory database with migrations and the demo seed applied. */
export async function createTestDb({ seed = true } = {}): Promise<TestDb> {
  const client = new PGlite();
  const db = await preparePglite(client, { seed });
  return { db, close: () => client.close() };
}

export type Person = keyof typeof DEMO;

export function userIdOf(person: Person): string {
  const id = DEMO[person].userId;
  if (!id) throw new Error(`${person} has no sign-in account in the seed`);
  return id;
}

export function staffIdOf(person: Person): string {
  const id = DEMO[person].staffId;
  if (!id) throw new Error(`${person} is not a staff member in the seed`);
  return id;
}

/** Runs `fn` as `person`, with RLS applied. */
export function as<T>(t: TestDb, person: Person, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUserOn(t.db, userIdOf(person), fn);
}

/** Runs one raw query as `person` and returns the rows. */
export function queryAs<T = Record<string, unknown>>(t: TestDb, person: Person, query: SQL): Promise<T[]> {
  return as(t, person, (tx) => rows<T>(tx, query));
}

export { sql, rows };
