import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("a coordinator returns a claim, the employee resubmits, the coordinator approves", async ({ page }) => {
  await signInAs(page, "Lena Fairbanks");
  await page.goto("/review");
  const team = page.getByRole("region", { name: /Your team/ });
  await team.getByRole("link", { name: /Rowan Ellery/ }).click();

  await page.getByLabel(/Return for changes/).check();
  await page.getByRole("button", { name: "Return to Rowan" }).click();
  await expect(page.getByText("Say what needs to change, so they can fix it.")).toBeVisible();
  await page.getByLabel("What should Rowan change?").fill("Please add the grant meeting agenda to the notes.");
  await page.getByRole("button", { name: "Return to Rowan" }).click();
  await expect(page).toHaveURL(/\/review\?done=returned/);
  await expect(page.getByText("Claim returned with your comment.")).toBeVisible();
  await expect(team.getByRole("link", { name: /Rowan Ellery/ })).toHaveCount(0);

  await signInAs(page, "Rowan Ellery");
  await expect(page.getByText(/was returned by Lena Fairbanks/)).toBeVisible();
  await page.getByRole("link", { name: /Fix and resubmit/ }).click();
  await expect(page.getByText("“Please add the grant meeting agenda to the notes.”").first()).toBeVisible();
  await page.getByLabel(/I confirm these trips were for SCCSC business/).check();
  await page.getByRole("button", { name: "Resubmit claim" }).click();
  await expect(page).toHaveURL(/done=resubmitted/);

  await signInAs(page, "Lena Fairbanks");
  await page.goto("/review");
  await page.getByRole("region", { name: /Your team/ }).getByRole("link", { name: /Rowan Ellery/ }).click();
  await page.getByRole("button", { name: /^Approve \$/ }).click();
  await expect(page).toHaveURL(/\/review\?done=approved/);

  await signInAs(page, "Rowan Ellery");
  await page.goto("/claims");
  const claim = page.getByRole("link", { name: /M-1001/ });
  await expect(claim).toContainText("Approved");
  await claim.click();
  const history = page.getByRole("complementary");
  await expect(history).toContainText("Returned for changes by Lena Fairbanks");
  await expect(history).toContainText("Resubmitted by Rowan Ellery");
  await expect(history).toContainText("Approved by Lena Fairbanks");
});

test("simple claims can be approved together; flagged ones need opening", async ({ page }) => {
  await signInAs(page, "Owen Castellano");
  await page.goto("/review");
  const team = page.getByRole("region", { name: /Your team/ });
  const lena = team.getByRole("listitem").filter({ hasText: "Lena Fairbanks" });
  const marcus = team.getByRole("listitem").filter({ hasText: "Marcus Holloway" }).filter({ hasText: "home trip" });
  await expect(marcus.getByRole("checkbox")).toHaveCount(0);
  await lena.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve 1" }).click();
  await expect(page).toHaveURL(/\/review\?done=bulk&count=1/);
  await expect(team.getByRole("listitem").filter({ hasText: "Lena Fairbanks" })).toHaveCount(0);
});

test("coordinators can't review their own claims", async ({ page }) => {
  await signInAs(page, "Owen Castellano");
  await page.goto("/claims");
  // Owen's own claim was approved by an admin; he sees it but can't act on it as a reviewer.
  await page.getByRole("link", { name: /M-10/ }).first().click();
  await expect(page.getByRole("heading", { name: "Your decision" })).toHaveCount(0);
});
