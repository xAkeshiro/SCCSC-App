import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("finance batches approved claims, exports the file, and marks them paid", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  await page.goto("/finance");
  const ready = page.getByRole("region", { name: /Ready to pay/ });
  await expect(ready.getByText("Owen Castellano", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create batch" }).click();
  await expect(page).toHaveURL(/\/finance\/batches\/[0-9a-f-]{36}\?done=created/);
  const batchName = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/B-\d+/)![0];

  // One payment per person, split by budget code, with the claim labels in the memo.
  const owen = page.getByRole("article", { name: "Payment to Owen Castellano" });
  await expect(owen).toContainText(/Memo MIL\d{6}/);
  await expect(owen.getByRole("cell", { name: /^57\d\d-\d+-\d+/ }).first()).toBeVisible();

  // Download the payments for Aplos, numbered from a first check number.
  await page.getByLabel("First check #").fill("1040");
  const aplosPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Aplos payments (Excel)" }).click();
  const aplos = await aplosPromise;
  expect(aplos.suggestedFilename()).toBe(`${batchName}-aplos-payments.xlsx`);
  expect(readFileSync(await aplos.path()).subarray(0, 2).toString()).toBe("PK");

  // And the trip detail.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Trip detail (CSV)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${batchName}-detail.csv`);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv).toContain("Batch,Pay period start,Pay period end,Claim,Employee,Type,Date");
  expect(csv).toContain("Owen Castellano");
  expect(csv).toContain("Workforce board meeting");
  expect(csv).toMatch(/,57\d\d-\d+-\d+,MIL\d{6},/);
  // Phone bills are paid in the same batches.
  expect(csv).toContain(",Phone bill,");

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

test("reports total trips and phone bills by employee, district and school, and download as CSV", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  // From well back, so the demo's phone bill months are included whatever today's date is.
  await page.goto("/finance/reports?from=2000-01-01");
  await expect(page.getByRole("region", { name: "By school or site" })).toContainText("FOOTHILL HIGH SCHOOL (211)");
  await expect(page.getByRole("region", { name: "By district" })).toContainText("Twin Rivers USD");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download details (CSV)" }).click();
  const csv = readFileSync(await (await downloadPromise).path(), "utf8");
  expect(csv).toContain("Type,Date,Employee,Business purpose");
  expect(csv).toContain("Phone bill,");
});

test("employees can't open finance pages", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  expect((await page.goto("/finance"))?.status()).toBe(404);
  expect((await page.goto("/finance/reports"))?.status()).toBe(404);
});
