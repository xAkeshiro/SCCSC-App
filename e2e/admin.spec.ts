import path from "node:path";
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("an admin updates budget codes from the Aplos template and hides a school from staff", async ({ page }) => {
  await signInAs(page, "Sam Whitlock");
  await page.goto("/admin/budget-codes", { waitUntil: "networkidle" });
  await expect(page.getByLabel("Mileage, direct")).toHaveValue("5702");
  await expect(page.getByLabel("Phone bills")).toHaveValue("5430");

  await page.locator('input[type="file"][name="file"]').setInputFiles(path.join(__dirname, "../tests/fixtures/aplos-template-sample.xlsx"));
  await page.getByRole("button", { name: "Update from this file" }).click();
  const summary = page.getByRole("status").filter({ hasText: "Budget codes updated from Aplos" });
  await expect(summary).toContainText("Schools and sites: 4 new ones, 2 updated");
  await expect(summary).toContainText('"Mystery Group"');

  // Hide a Twin Rivers school; staff no longer see it in the trip form.
  await page.getByText("200 · Twin Rivers USD").click();
  await page.getByRole("button", { name: "Hide FOOTHILL OAKS ELEMENTARY SCHOOL" }).click();
  await expect(page.getByRole("button", { name: "Show FOOTHILL OAKS ELEMENTARY SCHOOL" })).toBeVisible();

  await signInAs(page, "Rowan Ellery");
  await page.goto("/trips/new");
  const picker = page.getByLabel("School or site");
  await expect(picker.locator("option", { hasText: "LAS PALMAS ELEMENTARY (252)" })).toHaveCount(1);
  await expect(picker.locator("option", { hasText: "FOOTHILL OAKS ELEMENTARY SCHOOL" })).toHaveCount(0);
});

test("staff can't open admin pages", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  expect((await page.goto("/admin/budget-codes"))?.status()).toBe(404);
});
