import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-123";
export const MOCK_AUTH_URL = "http://localhost:5392";
export const SESSION_KEY = "farm.auth.session";

/** A fresh address per test so runs never collide in the e2e database. */
export function uniqueEmail(tag = "user") {
  return `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
}

/** Collects uncaught page errors so each test can assert the app stayed healthy. */
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

export const GUIDE_SEEN_KEY = "farm.guideSeen";

/**
 * Creates an account and opens the designer. Most tests skip the first-visit guide; the persona tests keep it to
 * check what a newcomer sees.
 */
export async function signUp(page: Page, email = uniqueEmail(), { showGuide = false }: { showGuide?: boolean } = {}) {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Grower");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  if (!showGuide) await page.evaluate((key) => window.localStorage.setItem(key, "1"), GUIDE_SEEN_KEY);
  await page.goto("/visualizer");
  return email;
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A step of the journey, in the rail on a laptop or the step sheet on a phone, in any language. */
export function stepButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true }).and(page.locator("[data-step]"));
}

/**
 * Opens one step of the planning journey: from the rail on a laptop, or on a phone from the sheet that the
 * "All steps" bar opens. The step's page names itself in the main landmark.
 */
export async function goToStep(page: Page, name: string) {
  const switcher = page.getByTestId("journey-switcher");
  if (await switcher.isVisible()) await switcher.click();
  await stepButton(page, name).click();
  await expect(page.locator("main#workspace-main")).toHaveAttribute("aria-label", name);
}

/** Opens the advisor from the "More options" menu; it is not offered on the Design step. */
export async function openAdvisor(page: Page) {
  await page.getByTestId("workspace-menu").click();
  await page.getByTestId("ask-advisor").click();
  const panel = page.getByTestId("advisor-panel");
  await expect(panel).toBeVisible();
  return panel;
}

/** Opens Saved setups: a header button on larger screens, in the "More options" menu on a phone. */
export async function openSavedSetups(page: Page) {
  const button = page.getByRole("button", { name: "Saved setups" });
  if (await button.isVisible()) await button.click();
  else {
    await page.getByTestId("workspace-menu").click();
    await page.getByRole("menuitem", { name: "Saved setups" }).click();
  }
}

/** Opens the Cost step, the first page of figures. */
export async function openResults(page: Page) {
  await goToStep(page, "Cost");
}

/** Fills every setup step via the recommended preset plus a location. */
export async function configureSetup(
  page: Page,
  state = "Maharashtra",
  district = "Pune",
  { waitForResults = true }: { waitForResults?: boolean } = {}
) {
  await page.getByRole("button", { name: /Use recommended/i }).click();
  await page.getByRole("combobox", { name: "State" }).click();
  await page.getByRole("option", { name: state, exact: true }).click();
  await page.getByRole("combobox", { name: "District" }).click();
  await page.getByRole("option", { name: district, exact: true }).click();
  // Results recalculate automatically once the setup is complete; the status beside the step bar says so.
  if (waitForResults) await expect(page.getByText("Up to date")).toBeVisible();
}
