import { expect, test } from "@playwright/test";
import { randomSuffix, signInAs } from "./helpers";

async function logTrip(page: import("@playwright/test").Page, purpose: string, place = "Cedar Grove Elementary") {
  await page.goto("/trips/new");
  await page.getByLabel("Where did you go?").selectOption({ label: place });
  await page.getByLabel("What was the trip for?").fill(purpose);
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page).toHaveURL(/\/trips\?saved=added/);
}

test("submit trips as a claim, withdraw it, and send it again @phone", async ({ page }) => {
  const a = `Workshop setup ${randomSuffix()}`;
  const b = `Supply run ${randomSuffix()}`;
  await signInAs(page, "Marcus Holloway");
  await logTrip(page, a);
  await logTrip(page, b, "Delta Family Resource Center");

  await page.goto("/claims/new");
  // Keep one trip for later.
  const tripA = page.locator("label").filter({ hasText: a });
  const tripB = page.locator("label").filter({ hasText: b });
  await expect(tripA.getByRole("checkbox")).toBeChecked();
  await tripB.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Submit claim" }).click();
  await expect(page.getByText(/Please tick the box to confirm/)).toBeVisible();
  await expect(tripB.getByRole("checkbox")).not.toBeChecked(); // choices kept
  await page.getByLabel(/I confirm these trips were for SCCSC business/).check();
  await page.getByRole("button", { name: "Submit claim" }).click();

  await expect(page).toHaveURL(/\/claims\/[0-9a-f-]{36}\?done=submitted/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Waiting for approval");
  await expect(page.getByText(a)).toBeVisible();
  await expect(page.getByText(b)).toHaveCount(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Withdraw" }).click();
  await expect(page).toHaveURL(/done=withdrawn/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Draft");

  // Add the kept trip and resubmit.
  await page.locator("label").filter({ hasText: b }).getByRole("checkbox").check();
  await page.getByLabel(/I confirm these trips were for SCCSC business/).check();
  await page.getByRole("button", { name: "Resubmit claim" }).click();
  await expect(page).toHaveURL(/done=resubmitted/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Waiting for approval");
  await expect(page.getByText(b)).toBeVisible();
  const history = page.getByRole("complementary");
  await expect(history).toContainText("Submitted by Marcus Holloway");
  await expect(history).toContainText("Withdrawn by Marcus Holloway");
  await expect(history).toContainText("Resubmitted by Marcus Holloway");
});

test("fix a returned claim and resubmit it", async ({ page }) => {
  await signInAs(page, "Tessa Quill");
  await page.goto("/claims");
  await page.getByRole("link", { name: /Returned for changes/ }).first().click();
  await expect(page.getByText(/Returned by Lena Fairbanks/)).toBeVisible();

  // Edit the home trip: start from the office instead.
  await page.getByRole("listitem").filter({ hasText: "Early program opening" }).first().getByRole("link", { name: /Edit/ }).click();
  await page.getByLabel("Where did you start?").selectOption({ label: "Main office" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/claims\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Starts or ends at home")).toHaveCount(0);

  await page.getByLabel(/I confirm these trips were for SCCSC business/).check();
  await page.getByRole("button", { name: "Resubmit claim" }).click();
  await expect(page).toHaveURL(/done=resubmitted/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Waiting for approval");
});

test("the printable claim is laid out like the paper mileage voucher, with both signatures", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  await page.goto("/claims");
  await page.getByRole("link", { name: /Paid/ }).first().click();
  await page.waitForURL(/\/claims\/[0-9a-f-]{36}/);
  const url = page.url().replace("/claims/", "/print/claims/");
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Mileage Claim Voucher" })).toBeVisible();
  for (const column of ["Date", "School or site", "Purpose", "Origin", "Destination", "Indirect miles", "Direct miles", "Parking fee"]) {
    await expect(page.getByRole("columnheader", { name: column, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Cost per mile × \$0\.7/)).toBeVisible();
  await expect(page.getByText("I certify I have a valid driver's license and vehicle coverage.")).toBeVisible();
  await expect(page.getByText(/Confirmed and submitted electronically by Rowan Ellery/)).toBeVisible();
  await expect(page.getByText(/Approved electronically by Lena Fairbanks/)).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Program launch at Cedar Grove" })).toContainText("FOOTHILL HIGH SCHOOL (211)");
});
