import { expect, type Page } from "@playwright/test";

/** Demo shortcut: sign in as one of the seeded people without a code. */
export async function signInAs(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Demo person").selectOption({ label: name });
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/**
 * The real flow: name + email (or a phone number, after switching), then the code (shown on screen
 * in demo mode).
 */
export async function signInWithCode(page: Page, name: string, emailOrPhone: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Full name").fill(name);
  if (emailOrPhone.includes("@")) {
    await page.getByLabel("Email", { exact: true }).fill(emailOrPhone);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText("Check your email")).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Use phone number instead" }).click();
    await expect(page.getByLabel("Mobile number")).toBeFocused();
    await page.getByLabel("Mobile number").fill(emailOrPhone);
    await page.getByRole("button", { name: "Text me a code" }).click();
    await expect(page.getByText("Check your phone")).toBeVisible();
  }
  const code = (await page.getByTestId("demo-code").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

export function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}
