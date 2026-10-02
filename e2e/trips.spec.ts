import { expect, test } from "@playwright/test";
import { randomSuffix, signInAs } from "./helpers";

test("log, edit and delete a trip, with parking, direct or indirect, and the school @phone", async ({ page }) => {
  const purpose = `Food bank pickup ${randomSuffix()}`;
  await signInAs(page, "Tessa Quill");
  await page.goto("/trips/new");

  // Typed address: no estimate, so the miles are entered by hand.
  await page.getByLabel("Where did you go?").selectOption({ label: "Another address…" });
  await page.getByLabel("Address").fill("200 Pretend Ave, Sacramento");
  await page.getByLabel("Miles").fill("7.4");
  await page.getByLabel("What was the trip for?").fill(purpose);
  await expect(page.getByText("$5.62")).toBeVisible(); // 7.4 mi x 76¢
  await page.getByLabel("Parking").fill("4.50");
  await expect(page.getByText("$10.12")).toBeVisible();
  // Tessa's last trip was indirect, so that's picked; this one is direct.
  await expect(page.getByRole("radio", { name: /^Indirect/ })).toBeChecked();
  await page.getByRole("radio", { name: /^Direct/ }).check();
  await expect(page.getByLabel("School or site")).toHaveValue(/.+/); // her usual one
  await page.getByRole("button", { name: "Save trip" }).click();

  await expect(page).toHaveURL(/\/trips\?saved=added/);
  const card = page.getByRole("listitem").filter({ hasText: purpose });
  await expect(card).toContainText("200 Pretend Ave, Sacramento");
  await expect(card).toContainText("$10.12");
  await expect(card).toContainText("Direct");
  await expect(card).toContainText("FOOTHILL HIGH SCHOOL");
  await expect(card).toContainText("Parking $4.50");

  await card.getByRole("link", { name: /Edit/ }).click();
  await page.getByLabel("Miles").fill("8");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/trips\?saved=updated/);
  await expect(page.getByRole("listitem").filter({ hasText: purpose })).toContainText("$10.58"); // 8 mi x 76¢ + $4.50

  await page.getByRole("listitem").filter({ hasText: purpose }).getByRole("link", { name: /Edit/ }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete trip" }).click();
  await expect(page).toHaveURL(/\/trips\?saved=deleted/);
  await expect(page.getByRole("listitem").filter({ hasText: purpose })).toHaveCount(0);
});

test("a changed estimate needs a reason, and the form keeps what was entered", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  await page.goto("/trips/new");
  await page.getByLabel("Where did you go?").selectOption({ label: "Harbor Point High" });
  await page.getByLabel("Round trip").check();
  const estimate = await page.getByLabel("Miles").inputValue();
  expect(Number(estimate)).toBeGreaterThan(0);
  await page.getByLabel("Miles").fill(String(Number(estimate) + 3));
  await page.getByLabel("What was the trip for?").fill("Job fair");
  await page.getByRole("button", { name: "Save trip" }).click();

  await expect(page.getByText(/Say why you drove a different distance/)).toBeVisible();
  await expect(page.getByLabel("Where did you go?")).toHaveValue(/.+/);
  await expect(page.getByLabel("Round trip")).toBeChecked();
  await expect(page.getByLabel("Why is it different from the estimate?")).toBeFocused();

  await page.getByLabel("Why is it different from the estimate?").fill("Parking was two blocks away");
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page).toHaveURL(/\/trips\?saved=added/);
  await expect(page.getByText("Why the miles changed: Parking was two blocks away").first()).toBeVisible();
});

test("trips in a sent claim are locked", async ({ page }) => {
  await signInAs(page, "Rowan Ellery");
  await page.goto("/trips");
  await page.getByRole("row").filter({ hasText: "Quarterly grant meeting" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/claims\//);
});
