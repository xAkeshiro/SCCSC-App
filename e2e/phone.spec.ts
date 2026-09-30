import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// A small but real PDF, as a phone company would send.
const BILL = {
  name: "phone-bill.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  ),
};

test("an employee claims their phone bill and their coordinator approves it", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  const card = page.getByRole("region", { name: "Phone bill" });
  await expect(card).toContainText("is ready to claim");
  await card.getByRole("link", { name: "Claim $90.00" }).click();
  await expect(page).toHaveURL(/\/phone$/);

  await page.getByLabel(/I confirm I used my own phone/).check();
  await page.getByRole("button", { name: "Claim phone bill" }).click();
  await expect(page.getByText("Please add a photo or PDF of your phone bill.")).toBeVisible();

  // A web page pretending to be a bill is refused; a PDF is accepted.
  await page.locator('input[type="file"]').setInputFiles({ name: "bill.html", mimeType: "text/html", buffer: Buffer.from("<html><body>Not a bill, just padding text</body></html>") });
  await expect(page.getByText(/isn't a photo or PDF/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(BILL);
  await expect(page.getByRole("button", { name: "Remove phone-bill.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Claim phone bill" }).click();
  await expect(page).toHaveURL(/\/claims\/[0-9a-f-]{36}\?done=submitted/);
  const claimRef = (await page.getByRole("heading", { level: 1 }).textContent())!.match(/P-\d+/)![0];
  await expect(page.getByRole("complementary").first()).toContainText("$90.00");
  await expect(page.getByRole("button", { name: "View phone-bill.pdf" })).toBeVisible();

  await signInAs(page, "Lena Fairbanks");
  await page.goto("/review");
  const team = page.getByRole("region", { name: /Your team/ });
  await team.getByRole("listitem").filter({ hasText: "Rowan Ellery" }).filter({ hasText: "Phone bill" }).getByRole("link").click();
  // The coordinator can open the bill before approving.
  await page.getByRole("button", { name: "View phone-bill.pdf" }).click();
  await expect(page.getByRole("button", { name: "Hide phone-bill.pdf" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download phone-bill.pdf" }).click();
  expect((await download).suggestedFilename()).toBe("phone-bill.pdf");
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
