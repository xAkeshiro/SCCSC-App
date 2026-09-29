import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("finance batches approved claims, exports the file, and marks them paid", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  await page.goto("/finance");
  const ready = page.getByRole("region", { name: /Ready to pay/ });
  await expect(ready.getByText("Owen Castellano")).toBeVisible();
  await page.getByRole("button", { name: "Create batch" }).click();
  await expect(page).toHaveURL(/\/finance\/batches\/[0-9a-f-]{36}\?done=created/);
  const batchName = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/B-\d+/)![0];

  // Download the trip detail file.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Trip detail (CSV)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${batchName}-detail.csv`);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv).toContain("Batch,Pay period start,Pay period end,Claim,Employee,Trip date");
  expect(csv).toContain("Owen Castellano");
  expect(csv).toContain("Workforce board meeting");

  // Exporting freezes the batch and unlocks "Mark as paid".
  await expect(page.getByText(/^Downloaded /)).toBeVisible();
  await expect(page.getByRole("button", { name: /Remove .* from the batch/ })).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page).toHaveURL(/done=paid/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Paid");

  // The employee sees it paid.
  await signInAs(page, "Owen Castellano");
  await page.goto("/claims");
  await expect(page.getByRole("region", { name: "Finished" })).toContainText("Paid");
});

test("a claim can be taken out of an open batch", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  await page.goto("/finance");
  await page.getByRole("link", { name: /Batch B-102/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Remove Tessa Quill's claim/ }).click();
  await expect(page).toHaveURL(/done=removed/);
  await page.goto("/finance");
  await expect(page.getByRole("region", { name: /Ready to pay/ })).toContainText("Tessa Quill");
});

test("reports total trips by employee and program, and download as CSV", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  await page.goto("/finance/reports");
  await expect(page.getByRole("region", { name: "By program or grant" })).toContainText("EXL");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download trips (CSV)" }).click();
  const csv = readFileSync(await (await downloadPromise).path(), "utf8");
  expect(csv).toContain("Trip date,Employee,Business purpose");
});

test("employees can't open finance pages", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  expect((await page.goto("/finance"))?.status()).toBe(404);
  expect((await page.goto("/finance/reports"))?.status()).toBe(404);
});
