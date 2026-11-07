import { expect, test } from "@playwright/test";
import { PASSWORD, trackPageErrors, uniqueEmail } from "./helpers";

// The real calculator answers these: no mocks, no account.
test.describe("landing example and no-account estimate", () => {
  test("the landing example comes from the calculator and says what it assumes", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/");
    const card = page.getByTestId("example-estimate");
    await expect(card).toContainText("not a quote");
    await expect(card).toContainText("Profit a year");
    // The default Maharashtra shed loses money at the planner's prices; the example must not hide that.
    await expect(card).toContainText("-₹");
    await expect(card).toContainText("Does not pay back");
    expect(errors).toEqual([]);
  });

  test("shows downside, base and upside, and recalculates when the sale price changes", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/estimate");
    const cases = page.getByTestId("estimate-cases");
    await expect(cases).toContainText("Downside");
    await expect(cases).toContainText("Base case");
    await expect(cases).toContainText("Upside");
    await expect(page.getByRole("alert")).toContainText("loses");

    const before = await cases.innerText();
    await page.getByLabel(/Live-bird price/).fill("140");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect.poll(async () => cases.innerText()).not.toBe(before);

    await page.getByRole("button", { name: /Reset to defaults/ }).click();
    await expect(page.getByRole("alert")).toContainText("loses");
    expect(errors).toEqual([]);
  });

  test("changing the state loads that state's own prices and asks for an account only to save", async ({ page }) => {
    await page.goto("/estimate");
    await expect(page.getByTestId("estimate-cases")).toBeVisible();
    await page.getByLabel("State").selectOption("Punjab");
    await expect(page.getByLabel(/Live-bird price/)).toHaveValue("99");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: /Save and refine/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Save and refine signs up and opens the same farm in the workspace", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/estimate");
    await expect(page.getByTestId("estimate-cases")).toBeVisible();
    await page.getByLabel("State").selectOption("Punjab");
    await expect(page.getByLabel(/Live-bird price/)).toHaveValue("99");
    await page.getByLabel(/Live-bird price/).fill("140");

    await page.getByRole("button", { name: /Save and refine/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("E2E Grower");
    await dialog.getByLabel("Email").fill(uniqueEmail("handoff"));
    await dialog.getByLabel("Password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/visualizer/);
    await expect(page.getByText(/Carried over from your estimate/)).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("Punjab");
    expect(errors).toEqual([]);
  });

  test("switching to layers shows the egg price", async ({ page }) => {
    await page.goto("/estimate");
    await expect(page.getByTestId("estimate-cases")).toBeVisible();
    await page.getByLabel("Type of farm").selectOption("layer-cage");
    await expect(page.getByLabel(/egg/i).first()).toBeVisible();
    await expect(page.getByTestId("estimate-cases")).toContainText("Base case");
  });
});
