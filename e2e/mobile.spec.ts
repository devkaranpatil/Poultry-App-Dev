import { expect, test } from "@playwright/test";
import { configureSetup, signUp, trackPageErrors } from "./helpers";

test("mobile workspace switches between setup, 3D and the planning steps", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signUp(page);
  await configureSetup(page, "Maharashtra", "Pune", { waitForResults: false });

  // The Design step holds both the form and the model; a toggle switches between them.
  await page.getByRole("radio", { name: "3D view" }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  // The steps scroll along the top on a phone.
  await page.getByRole("tab", { name: "Cost", exact: true }).click();
  await expect(page.getByText("Up to date")).toBeVisible();
  await expect(page.getByText("Project cost")).toBeVisible();

  await page.getByRole("tab", { name: "Design", exact: true }).click();
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
    await expect(page.getByRole("tab", { name: next, exact: true })).toHaveAttribute("aria-selected", "true");
  }
  // The advisor fits a phone screen too: the corner button opens it as a sheet over most of the screen.
  await page.getByTestId("advisor-launcher").click();
  const chat = page.getByTestId("advisor-window");
  await expect(chat).toBeVisible();
  const box = await chat.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport ? box.height / viewport.height : 0).toBeGreaterThan(0.85);
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  await expect(page.getByTestId("advisor-launcher")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
