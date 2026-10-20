import { expect, test } from "@playwright/test";
import { configureSetup, signUp, trackPageErrors } from "./helpers";

test.describe("dashboard", () => {
  test("a new account sees an empty dashboard and can start a design", async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome back");
    await expect(page.getByTestId("dashboard-empty")).toBeVisible();
    await page.getByRole("button", { name: "New shed" }).first().click();
    await expect(page).toHaveURL(/visualizer/);
    await expect(page.getByTestId("scene-canvas")).toHaveCount(0); // an empty setup has nothing to render yet
    expect(errors).toEqual([]);
  });

  test("saved setups show their cost and can be opened, duplicated and deleted", async ({ page }) => {
    await signUp(page);
    await configureSetup(page);

    await page.getByRole("button", { name: "Saved setups" }).click();
    await page.getByRole("textbox", { name: "Configuration name" }).fill("Dash 30x10");
    await page.getByRole("button", { name: "Save to my account" }).click();
    await expect(page.getByText("Dash 30x10").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // The unfinished draft is offered back, and the saved setup is a card with its estimated cost.
    await page.goto("/dashboard");
    await expect(page.getByTestId("draft-card")).toContainText("Pune, Maharashtra");
    const card = page.getByTestId("setup-card").filter({ hasText: "Dash 30x10" });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("setup-cost")).toContainText("₹");
    await expect(card).toContainText("30 × 10 m");

    await card.getByRole("button", { name: "Duplicate" }).click();
    const copy = page.getByTestId("setup-card").filter({ hasText: "Dash 30x10 copy" });
    await expect(copy).toBeVisible();

    await page.getByRole("button", { name: "Delete Dash 30x10 copy" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(copy).toHaveCount(0);
    await expect(card).toBeVisible();

    // Opening a setup loads it into the designer.
    await card.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/visualizer/);
    await expect(page.locator("header").getByText("Pune, Maharashtra")).toBeVisible();
    await expect(page.getByTestId("model-dimensions")).toContainText("30 × 10");
  });

  test("the Dashboard link in the designer leads back, and the Design tab returns", async ({ page }) => {
    await signUp(page);
    await configureSetup(page);
    await page.getByRole("link", { name: "Dashboard" }).first().click();
    await expect(page).toHaveURL(/dashboard/);
    await page.getByRole("link", { name: "Design" }).first().click();
    await expect(page).toHaveURL(/visualizer/);
  });
});
