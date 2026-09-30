import { expect, test } from "@playwright/test";
import { randomSuffix, signInAs, signInWithCode, signOut } from "./helpers";

test("someone on the staff list signs straight in with an emailed code @phone", async ({ page }) => {
  await signInWithCode(page, "Felix Hartwell", "Felix.Hartwell@example.org");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, Felix");
});

test("people can switch to their phone number instead @phone", async ({ page }) => {
  await signInWithCode(page, "Marcus Holloway", "916-555-0103");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, Marcus");
});

test("the email field explains a typo and keeps what was typed", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Full name").fill("Rowan Ellery");
  await page.getByLabel("Email", { exact: true }).fill("rowan.ellery@example");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByText("Enter your email address, like name@example.com.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Rowan Ellery");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("rowan.ellery@example");
});

test("a wrong code is explained, and the right one still works", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Full name").fill("Rowan Ellery");
  await page.getByLabel("Email", { exact: true }).fill("rowan.ellery@example.org");
  await page.getByRole("button", { name: "Email me a code" }).click();
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
  const suffix = randomSuffix();
  const name = `Casey Newhire${suffix}`;
  const email = `casey.newhire.${suffix}@example.org`;

  await signInWithCode(page, name, email);
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

  await signInWithCode(page, name, email);
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
