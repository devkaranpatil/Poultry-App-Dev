import { expect, test, type Page } from "@playwright/test";
import { configureSetup, signUp, trackPageErrors } from "./helpers";

const SHOTS = "test-results/layout";

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("layout", () => {
  test("design, results and dashboard fit the screen without overflow", async ({ page, isMobile }) => {
    test.skip(isMobile, "the mobile project has its own spec");
    const errors = trackPageErrors(page);
    await signUp(page);
    await configureSetup(page);
    await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-build-stage", "6", { timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Design: the model, with the design sidebar docked beside it.
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/design.png` });

    await page.getByRole("button", { name: "Roof", exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/design-editing.png` });

    for (const step of ["Site", "Cost", "Earnings", "Loan & subsidy", "Risk", "AI summary", "Report"]) {
      await page.getByRole("tab", { name: step, exact: true }).click();
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/step-${step.replace(/\W+/g, "-").toLowerCase()}.png` });
    }

    // The advisor chat sits in the bottom-right corner, small first and full screen on request.
    await page.getByTestId("advisor-launcher").click();
    await expect(page.getByTestId("advisor-window")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/advisor-window.png` });
    await page.getByRole("button", { name: "Open full screen" }).click();
    await expect(page.getByTestId("advisor-fullscreen")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/advisor-fullscreen.png` });
    await page.getByRole("button", { name: "Close advisor" }).click();
    await expect(page.getByTestId("advisor-fullscreen")).toBeHidden();

    await page.getByRole("tab", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: "Saved setups" }).click();
    await page.getByRole("textbox", { name: "Configuration name" }).fill("Pune tomato house");
    await page.getByRole("button", { name: "Save to my account" }).click();
    await expect(page.getByText("Pune tomato house").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/dashboard");
    await expect(page.getByTestId("setup-cost")).toContainText("₹");
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test("the designer and dashboard work on a phone", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout only");
    await signUp(page);
    await configureSetup(page, "Maharashtra", "Pune", { waitForResults: false });
    await page.getByRole("radio", { name: "3D view" }).click();
    await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-build-stage", "6", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/mobile-design.png` });

    await page.getByRole("button", { name: "Roof", exact: true }).click();
    await expect(page.getByTestId("part-editor")).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/mobile-design-editing.png` });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/mobile-dashboard.png`, fullPage: true });
  });
});
