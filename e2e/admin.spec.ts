import path from "node:path";
import { expect, test } from "@playwright/test";
import { signInAs, signInWithCode } from "./helpers";

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

test("an admin adds a person, who can then sign in right away", async ({ page }) => {
  await signInAs(page, "Sam Whitlock");
  await page.goto("/admin/staff");
  await page.getByRole("link", { name: "Add a person" }).click();
  await page.getByRole("button", { name: "Add to the staff list" }).click();
  await expect(page.getByText("Enter their full name.")).toBeVisible();
  await expect(page.getByText("Add an email or a mobile number. It's how they sign in.")).toBeVisible();

  await page.getByLabel("Full name").fill("Jordan Pike");
  await page.getByLabel("Work email").fill("Jordan.Pike@example.org");
  await page.getByLabel("Who reviews their claims").selectOption({ label: "Lena Fairbanks" });
  await page.getByLabel("Usual school or site").selectOption({ label: "FOOTHILL HIGH SCHOOL (211)" });
  await page.getByRole("button", { name: "Add to the staff list" }).click();
  await expect(page.getByText("Added to the staff list. They can sign in now.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jordan Pike");
  await expect(page.getByText("Added Jordan Pike (Employee)")).toBeVisible();

  // On the list, so no waiting for approval. Capitals and spaces in the name don't matter.
  await signInWithCode(page, "jordan  pike", "jordan.pike@example.org");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/trips/new");
  await expect(page.getByLabel("School or site")).toHaveValue(/.+/);
});

test("an admin can't lock themselves out or strand a team, and changes go in the history", async ({ page }) => {
  await signInAs(page, "Sam Whitlock");
  await page.goto("/admin/staff?q=whitlock");
  await page.getByRole("link", { name: /Sam Whitlock/ }).click();
  await page.getByRole("checkbox", { name: /^Admin/ }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("You can't remove your own Admin role. Ask another admin to do it.")).toBeVisible();

  await page.goto("/admin/staff?q=castellano");
  await page.getByRole("link", { name: /Owen Castellano/ }).click();
  await expect(page.getByText(/^Owen reviews \d people:/)).toBeVisible();
  await page.getByRole("checkbox", { name: /^Coordinator/ }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Owen Castellano reviews \d people\. Move them to another reviewer first/)).toBeVisible();

  await page.goto("/admin/staff?q=hartwell");
  await page.getByRole("link", { name: /Felix Hartwell/ }).click();
  await page.getByLabel("Name in Aplos").fill("Hartwell, Felix");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();

  await page.goto("/admin/history?view=admin");
  await expect(page.getByRole("list", { name: "Admin changes, newest first" })).toContainText("Felix Hartwell: Name in Aplos: Hartwell, Felix");
  await page.getByRole("navigation", { name: "Which history" }).getByRole("link", { name: "Claims" }).click();
  await page.getByLabel("Whose claims").selectOption({ label: "Marcus Holloway" });
  await page.getByLabel("What happened").selectOption({ label: "Denied" });
  await page.getByRole("button", { name: "Show" }).click();
  const steps = page.getByRole("list", { name: "Claim history, newest first" });
  await expect(steps.getByRole("listitem")).toHaveCount(1);
  await expect(steps).toContainText("commute");
});

test("an admin adds a rate for later, deletes it, and changes a rule", async ({ page }) => {
  await signInAs(page, "Sam Whitlock");
  await page.goto("/admin/rates", { waitUntil: "networkidle" });
  const mileage = page.locator("#mileage");
  await expect(mileage).toContainText("$0.76 a mile");
  await mileage.getByRole("button", { name: "Add a mileage rate" }).click();
  await mileage.getByLabel("Dollars per mile").fill("0.80");
  await mileage.getByLabel("Starts on").fill("2099-01-01");
  await mileage.getByLabel("Note").fill("Test rate");
  await mileage.getByRole("button", { name: "Save rate" }).click();
  await expect(page.getByText("Rate saved.")).toBeVisible();
  await expect(page.locator("#mileage")).toContainText("Coming up");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete the rate starting Jan 1, 2099" }).click();
  await expect(page.getByText("Rate deleted.")).toBeVisible();
  await expect(page.locator("#mileage")).not.toContainText("Coming up");

  await page.getByLabel("Stay signed in for (days)").fill("0");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Enter a number of days from 1 to 90.")).toBeVisible();
  await page.getByLabel("Stay signed in for (days)").fill("45");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("Rules saved. They apply from now on.")).toBeVisible();
  await expect(page.getByLabel("Stay signed in for (days)")).toHaveValue("45");
  await page.goto("/admin/history?view=admin&area=rules");
  await expect(page.getByRole("list", { name: "Admin changes, newest first" })).toContainText("Stay signed in for: 45 days");
});

test("an admin imports a staff list after checking what will change", async ({ page }) => {
  await signInAs(page, "Sam Whitlock");
  await page.goto("/admin/staff/import", { waitUntil: "networkidle" });
  await page.locator('input[type="file"][name="file"]').setInputFiles(path.join(__dirname, "../tests/fixtures/staff-list-sample.csv"));
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("Names from “First Name + Last Name”, emails from “Work Email”, mobile numbers from “Mobile Phone”.")).toBeVisible();
  await expect(page.getByText("New people (2)")).toBeVisible();
  await expect(page.getByText("Can't be imported (1)")).toBeVisible();
  await expect(page.getByText("“not-an-email” isn't an email address")).toBeVisible();
  await page.getByText("Already up to date (3)").click();
  await expect(page.getByText("On the list as Tessa Quill")).toBeVisible();

  await page.getByRole("button", { name: "Add 2 people" }).click();
  await expect(page).toHaveURL(/\/admin\/staff\?imported=2-0/);
  await expect(page.getByText("2 people added, 0 records updated.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Juniper Ortiz/ })).toBeVisible();
});

test("staff can't open admin pages", async ({ page }) => {
  await signInAs(page, "Hazel Brightwater");
  for (const path of ["/admin/budget-codes", "/admin/staff", "/admin/staff/new", "/admin/rates", "/admin/history"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
});
