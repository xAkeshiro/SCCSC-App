import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { hasHostedDatabase } from "@/db";
import type { Contact } from "@/lib/contact";

/**
 * Signed, http-only cookies.
 * - `sccsc_session`: who is signed in (their auth user id), for `session_days`.
 * - `sccsc_signin`: the name and email or phone typed on the sign-in page, while they enter the code.
 */
const SESSION_COOKIE = "sccsc_session";
const PENDING_COOKIE = "sccsc_signin";
const PENDING_MINUTES = 15;

function secret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value) return value;
  if (hasHostedDatabase()) throw new Error("SESSION_SECRET must be set when DATABASE_URL is set.");
  // Demo and local dev only (fake data). Production refuses to start without a real secret.
  return "demo-only-session-secret-not-for-real-data";
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function signToken(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${body}.${hmac(body)}`;
}

export function verifyToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(hmac(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function setSession(userId: string, days: number) {
  const ttl = Math.max(1, days) * 24 * 60 * 60;
  (await cookies()).set(SESSION_COOKIE, signToken({ sub: userId }, ttl), { ...cookieBase, maxAge: ttl });
}

export async function getSessionUserId(): Promise<string | null> {
  const data = verifyToken<{ sub?: string }>((await cookies()).get(SESSION_COOKIE)?.value);
  return typeof data?.sub === "string" ? data.sub : null;
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export type PendingSignIn = { name: string; contact: Contact };

export async function setPendingSignIn({ name, contact }: PendingSignIn) {
  const ttl = PENDING_MINUTES * 60;
  const token = signToken({ name, kind: contact.kind, value: contact.value }, ttl);
  (await cookies()).set(PENDING_COOKIE, token, { ...cookieBase, maxAge: ttl });
}

export async function getPendingSignIn(): Promise<PendingSignIn | null> {
  const data = verifyToken<{ name?: unknown; kind?: unknown; value?: unknown }>((await cookies()).get(PENDING_COOKIE)?.value);
  if (typeof data?.name !== "string" || typeof data.value !== "string") return null;
  if (data.kind !== "email" && data.kind !== "phone") return null;
  return { name: data.name, contact: { kind: data.kind, value: data.value } };
}

export async function clearPendingSignIn() {
  (await cookies()).delete(PENDING_COOKIE);
}
