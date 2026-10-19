import { expect, test } from "@playwright/test";
import { configureSetup, goToStep, logIn, openResults, signUp, trackPageErrors } from "./helpers";

test.describe("workspace", () => {
  test("configure a greenhouse and get climate-aware results", async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page);
    await configureSetup(page);

    // Header reflects the project, and the live estimate sits beside it.
    await expect(page.getByText("Pune, Maharashtra")).toBeVisible();
    await expect(page.getByText(/₹\d+(\.\d+)? L/).first()).toBeVisible();

    // The 3D viewer renders a WebGL canvas.
    await expect(page.locator("canvas").first()).toBeVisible();

    // The Cost step: headline figures in Indian rupee formatting and a plain summary.
    await openResults(page);
    await expect(page.getByText("Project cost")).toBeVisible();
    await expect(page.getByText(/₹\d+(\.\d+)? L/).first()).toBeVisible();
    await expect(page.getByTestId("in-short")).toContainText("Building this 300 m² greenhouse costs about");

    // Earnings: changing the subsidy changes the plain summary of what you pay back.
    await goToStep(page, "Earnings");
    const subsidy = page.getByLabel("Subsidy (%)", { exact: true });
    await expect(subsidy).toHaveValue("50");
    const summaryBefore = await page.getByTestId("in-short").textContent();
    await subsidy.fill("0");
    await expect(page.getByTestId("in-short")).not.toHaveText(summaryBefore ?? "");

    // Bank loan: a schedule for the whole tenure that follows the terms, and how to claim the subsidy.
    await goToStep(page, "Loan & subsidy");
    const loan = page.getByTestId("loan-panel");
    await expect(loan.getByText("Bank loan")).toBeVisible();
    await loan.getByText("Show details").click();
    await expect(loan.getByTestId("loan-years").getByRole("row")).toHaveCount(8);
    await loan.getByLabel("Repayment (years, with moratorium)").fill("5");
    await expect(loan.getByTestId("loan-years").getByRole("row")).toHaveCount(6);
    const checklist = page.getByTestId("subsidy-checklist");
    await expect(checklist.getByText("How to claim the subsidy")).toBeVisible();
    await checklist.getByRole("checkbox").first().click();
    await expect(checklist.getByText(/^1 of \d+ done$/)).toBeVisible();

    // Site: climate for the chosen state.
    await goToStep(page, "Site");
    await expect(page.getByText("Crops for this climate")).toBeVisible();

    // The advisor opens from the corner on any step and explains it needs the model (the e2e backend runs without one).
    const launcher = page.getByTestId("advisor-launcher");
    await launcher.click();
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    const chat = page.getByTestId("advisor-window");
    await expect(chat.getByText("AI advisor isn't set up yet")).toBeVisible();
    // Full screen and back: Escape steps down to the small window, then closes it.
    await chat.getByRole("button", { name: "Open full screen" }).click();
    await expect(page.getByTestId("advisor-fullscreen")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("advisor-fullscreen")).toBeHidden();
    await expect(chat).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(chat).toBeHidden();
    await expect(launcher).toBeFocused();

    expect(errors).toEqual([]);
  });

  test("export a PDF report and an Excel workbook", async ({ page }) => {
    await signUp(page);
    await configureSetup(page, "Goa", "North Goa");

    // The AI summary is optional: without the model it says so and lets you skip straight to the report.
    await goToStep(page, "AI summary");
    await expect(page.getByText("AI advisor isn't set up yet")).toBeVisible();
    await page.getByRole("button", { name: "Skip, go to the report" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Report" })).toBeVisible();
    await expect(page.getByTestId("report-summary-status")).toContainText("No AI summary in this report");

    for (const [button, extension] of [
      ["Download PDF", ".pdf"],
      ["Download Excel", ".xlsx"],
    ] as const) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: button }).click()]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^greenhouse-north-goa-\\d{4}-\\d{2}-\\d{2}\\${extension}$`));
      const path = await download.path();
      expect(path).toBeTruthy();
    }
  });

  test("restore the draft after reload", async ({ page }) => {
    await signUp(page);
    await configureSetup(page, "Kerala", "Ernakulam");
    await page.reload();
    await expect(page.getByText("Ernakulam, Kerala")).toBeVisible();
    await expect(page.getByText("Up to date")).toBeVisible();
    await expect(page.getByText("7 of 7 done")).toBeVisible();
  });

  test("save two setups and compare them", async ({ page }) => {
    await signUp(page);
    await configureSetup(page);

    await page.getByRole("button", { name: "Saved setups" }).click();
    const name = page.getByRole("textbox", { name: "Configuration name" });
    await name.fill("Pune 30x10");
    await page.getByRole("button", { name: "Save to my account" }).click();
    await expect(page.getByText("Pune 30x10").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Change the footprint, then save a second variant.
    await page.getByTestId("properties-panel").getByRole("button", { name: "Size", exact: true }).click();
    const length = page.getByRole("spinbutton", { name: "Length (m)" });
    await length.fill("48");
    await length.blur();
    await expect(page.getByText("Up to date")).toBeVisible();
    await page.getByRole("button", { name: "Saved setups" }).click();
    await name.fill("Pune 48x10");
    await page.getByRole("button", { name: "Save to my account" }).click();
    await expect(page.getByText("Pune 48x10").first()).toBeVisible();

    await page.getByRole("checkbox", { name: /Pune 30x10/ }).click();
    await page.getByRole("checkbox", { name: /Pune 48x10/ }).click();
    await page.getByRole("button", { name: /Compare \(2\)/ }).click();
    await expect(page.getByRole("heading", { name: "Compare setups" })).toBeVisible();
    // Different sizes have different costs, so exactly one is marked best.
    await expect(page.getByRole("row", { name: /Total cost/ }).getByText("Best")).toHaveCount(1);
  });

  test("a share link opens the same setup for another user", async ({ page, browser }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await signUp(page);
    await configureSetup(page, "Punjab", "Ludhiana");
    await page.getByRole("button", { name: "Share" }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/visualizer\?setup=/);

    // A second, signed-out visitor follows the link and logs in.
    const other = await browser.newContext();
    const visitor = await other.newPage();
    const email = await signUp(visitor);
    await visitor.getByRole("button", { name: /Settings|E2E Grower|EG/ }).first().click();
    await visitor.getByRole("menuitem", { name: /Log out|Logout/i }).click();
    await visitor.goto(link);
    await expect(visitor).toHaveURL(/\/login/);
    await logIn(visitor, email);
    await expect(visitor.getByText("Ludhiana, Punjab")).toBeVisible();
    await other.close();
  });
});
