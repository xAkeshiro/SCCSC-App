import { expect, test } from "@playwright/test";
import { randomPhone, randomSuffix, signInAs, signInWithCode, signOut } from "./helpers";

test("someone on the staff list signs straight in with a code @phone", async ({ page }) => {
  await signInWithCode(page, "Felix Hartwell", "916-555-0108");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, Felix");
});

test("a wrong code is explained, and the right one still works", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Full name").fill("Rowan Ellery");
  await page.getByLabel("Mobile number").fill("(916) 555-0101");
  await page.getByRole("button", { name: "Text me a code" }).click();
  const code = (await page.getByTestId("demo-code").textContent())!.trim();
  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("6-digit code").fill(wrong);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/That code isn't right/)).toBeVisible();
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, Rowan");
});

test("a new person waits for approval, an admin approves, then they're in", async ({ page }) => {
  const name = `Casey Newhire${randomSuffix()}`;
  const phone = randomPhone();

  await signInWithCode(page, name, phone);
  await expect(page).toHaveURL(/\/pending$/);
  await expect(page.getByText("Your account is waiting for approval.")).toBeVisible();

  await signInAs(page, "Sam Whitlock");
  await page.goto("/admin");
  const card = page.getByRole("listitem").filter({ hasText: name });
  await card.getByRole("button", { name: "Approve" }).click();
  await card.getByLabel("Their coordinator").selectOption({ label: "Lena Fairbanks" });
  await card.getByRole("button", { name: /^Approve Casey/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Lena Fairbanks");
  await signOut(page);

  await signInWithCode(page, name, phone);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, Casey");
});

test("pages need a signed-in person, and role areas are hidden from others", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await signInAs(page, "Rowan Ellery");
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
});
