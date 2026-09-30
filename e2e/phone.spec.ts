import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("an employee claims their phone bill and their coordinator approves it", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  const card = page.getByRole("region", { name: "Phone bill" });
  await expect(card).toContainText("is ready to claim");
  await card.getByRole("link", { name: "Claim $90.00" }).click();
  await expect(page).toHaveURL(/\/phone$/);

  await page.getByRole("button", { name: "Claim phone bill" }).click();
  await expect(page.getByText("Please tick the box to confirm you used your own phone for SCCSC work.")).toBeVisible();
  await page.getByLabel(/I confirm I used my own phone/).check();
  await page.getByRole("button", { name: "Claim phone bill" }).click();
  await expect(page).toHaveURL(/\/claims\/[0-9a-f-]{36}\?done=submitted/);
  const claimRef = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/P-\d+/)![0];
  await expect(page.getByRole("complementary").first()).toContainText("$90.00");

  await signInAs(page, "Lena Fairbanks");
  await page.goto("/review");
  const team = page.getByRole("region", { name: /Your team/ });
  await team.getByRole("listitem").filter({ hasText: "Rowan Ellery" }).filter({ hasText: "Phone bill" }).getByRole("link").click();
  await page.getByRole("button", { name: /^Approve \$/ }).click();
  await expect(page).toHaveURL(/\/review\?done=approved/);

  await signInAs(page, "Rowan Ellery");
  await expect(page.getByRole("region", { name: "Phone bill" })).toContainText("You've claimed");
  await expect(page.getByText(`Claim ${claimRef} was approved by Lena Fairbanks`)).toBeVisible();
});

test("a returned phone bill claim can drop a month and be resubmitted", async ({ page }) => {
  await signInAs(page, "Lena Fairbanks");
  await page.goto("/claims");
  await page.getByRole("region", { name: "Needs you" }).getByRole("link", { name: /P-\d+/ }).click();
  await expect(page.getByText(/You were on leave in/).first()).toBeVisible();
  await page.locator('input[name="item"]').first().uncheck();
  await page.getByLabel(/I confirm I used my own phone/).check();
  await page.getByRole("button", { name: "Resubmit claim" }).click();
  await expect(page).toHaveURL(/done=resubmitted/);
  await expect(page.getByRole("complementary").first()).toContainText("$45.00");

  // Owen approves it, which also leaves his queue as the review tests expect.
  await signInAs(page, "Owen Castellano");
  await page.goto("/review");
  await page.getByRole("region", { name: /Your team/ }).getByRole("listitem").filter({ hasText: "Phone bill" }).getByRole("link").click();
  await page.getByRole("button", { name: /^Approve \$/ }).click();
  await expect(page).toHaveURL(/\/review\?done=approved/);
});
