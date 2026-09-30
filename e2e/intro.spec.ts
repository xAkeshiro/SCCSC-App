import { expect, test, type Page } from "@playwright/test";

const intro = (page: Page) => page.locator("[data-intro-screen]");

test.describe("with motion", () => {
  // The other tests run with reduced motion, which turns the intro off. Here it plays.
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the opening animation plays once in a tab, then gets out of the way @phone", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(intro(page)).toBeVisible();
    // It fades into the page on its own after about 3 seconds.
    await expect(intro(page)).toHaveCount(0, { timeout: 6_000 });
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
    // Not again on a reload or another page in the same tab.
    await page.reload();
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  });

  test("a tap or Escape skips it", async ({ page, context }) => {
    await page.goto("/sign-in");
    await expect(intro(page)).toBeVisible();
    await intro(page).click();
    await expect(intro(page)).toHaveCount(0, { timeout: 1_000 });

    const other = await context.newPage();
    await other.goto("/sign-in");
    await expect(intro(other)).toBeVisible();
    await other.keyboard.press("Escape");
    await expect(intro(other)).toHaveCount(0, { timeout: 1_000 });
  });
});

test("it never plays for people who prefer less motion", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
  await expect(intro(page)).toHaveCount(0);
});
