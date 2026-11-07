import { expect, test, type Page } from "@playwright/test";
import { configureSetup, goToStep, openAdvisor, openSavedSetups, signUp, trackPageErrors } from "./helpers";

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

    for (const step of ["Site & rules", "Cost", "Earnings", "Loan", "Risk", "AI summary", "Report"]) {
      await goToStep(page, step);
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `${SHOTS}/step-${step.replace(/\W+/g, "-").toLowerCase()}.png` });
    }

    // The advisor opens from "More options": docked beside the step on a laptop, a page of its own on a phone.
    const advisor = await openAdvisor(page);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/advisor.png` });
    await page.keyboard.press("Escape");
    await expect(advisor).toBeHidden();

    await goToStep(page, "Design");
    await openSavedSetups(page);
    await page.getByRole("textbox", { name: "Configuration name" }).fill("Pune broiler shed");
    await page.getByRole("button", { name: "Save to my account" }).click();
    await expect(page.getByText("Pune broiler shed").first()).toBeVisible();
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
