import { expect, type Page } from "@playwright/test";

/** Demo shortcut: sign in as one of the seeded people without a code. */
export async function signInAs(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** The real flow: name + phone, then the code (shown on screen in demo mode). */
export async function signInWithCode(page: Page, name: string, phone: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Text me a code" }).click();
  const code = (await page.getByTestId("demo-code").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** A fictional 555-01xx number that is not used by the seed (0101-0109). */
export function randomPhone() {
  const n = 150 + Math.floor(Math.random() * 50);
  return `(916) 555-0${n}`;
}

export function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}
