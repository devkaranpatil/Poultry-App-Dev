import { expect, test } from "@playwright/test";
import { configureSetup, goToStep, openAdvisor, signUp, trackPageErrors } from "./helpers";

test("mobile workspace switches between setup, 3D and the planning steps", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signUp(page);
  await configureSetup(page, "Maharashtra", "Pune", { waitForResults: false });

  // The Design step holds both the form and the model; a toggle switches between them.
  await page.getByRole("radio", { name: "3D view" }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  // On a phone one bar says where you are; every step is in the sheet it opens.
  await expect(page.getByTestId("journey-switcher")).toContainText("Design");
  await goToStep(page, "Cost");
  await expect(page.getByTestId("journey-switcher")).toContainText("Step 3 of 8");
  await expect(page.getByText("Up to date")).toBeVisible();
  await expect(page.getByText("Build cost")).toBeVisible();

  await goToStep(page, "Design");
  await page.getByRole("radio", { name: "Setup" }).click();
  await expect(page.getByText("Project setup")).toBeVisible();

  // Nothing in the header should overflow the narrow viewport.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a newcomer on a phone follows the guide and the steps", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = trackPageErrors(page);
  await signUp(page, undefined, { showGuide: true });
  await page.getByTestId("welcome-guide").getByRole("button", { name: "Start with a recommended shed" }).click();
  await page.getByRole("combobox", { name: "State" }).click();
  await page.getByRole("option", { name: "Maharashtra", exact: true }).click();
  await page.getByRole("combobox", { name: "District" }).click();
  await page.getByRole("option", { name: "Pune", exact: true }).click();

  const done = page.getByTestId("design-complete");
  await done.getByRole("button", { name: "Next: Site" }).click();
  for (const next of ["Cost", "Earnings", "Loan"]) {
    await expect(page.getByTestId("in-short")).toBeVisible({ timeout: 30_000 });
    // click() scrolls the button into view itself, and retries if a results refresh re-renders it.
    await page.getByRole("button", { name: `Next: ${next}` }).click();
    await expect(page.locator("main#workspace-main")).toHaveAttribute("aria-label", next);
    // The step is in the address, so the phone's back button and a refresh keep the user on it.
    await expect(page).toHaveURL(new RegExp(`step=${next.toLowerCase()}`));
  }
  // No chat button floats over the step; the advisor opens from "More options" as a page of its own.
  await expect(page.getByTestId("advisor-launcher")).toHaveCount(0);
  const chat = await openAdvisor(page);
  const box = await chat.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport ? box.height / viewport.height : 0).toBeGreaterThan(0.95);
  // The phone's back button closes it and leaves the user on the same step.
  await page.goBack();
  await expect(chat).toBeHidden();
  await expect(page.locator("main#workspace-main")).toHaveAttribute("aria-label", "Loan");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
