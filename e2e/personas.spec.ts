import { expect, test, type Page } from "@playwright/test";
import { configureSetup, goToStep, signUp, trackPageErrors } from "./helpers";

/**
 * Journeys for the people the planner is for, from a first-time grower to a banker checking the numbers. Each one
 * uses only what is on the screen: the guide, the step bar, the Next buttons, the "?" explanations and the advisor.
 */

const ANSWER = "Show the bank your project report, the land papers and the quotation from the vendor [1].";

const VERDICT = "A sound first project if the monsoon humidity is managed.";

/** The e2e backend has no AI model, so the advisor's answers are stubbed in the browser. */
async function stubAdvisor(page: Page) {
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, model: "stub" } }));
  await page.route("**/api/ai/advisor", (route) =>
    route.fulfill({
      json: {
        report: {
          summary: VERDICT,
          verdict: "viable",
          strengths: ["Strong local demand for tomato"],
          risks: [{ title: "Fungal disease", detail: "High humidity in the monsoon", severity: "medium" }],
          recommendations: [{ title: "Add insect netting", detail: "Fit 40-mesh net on the vents", category: "structure", impact: "Fewer pests" }],
        },
      },
    })
  );
  await page.route("**/api/ai/chat", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: `${ANSWER}[[AI_SOURCES]]${JSON.stringify({
        sources: [{ n: 1, title: "NHB Scheme-1 guidelines", publisher: "NHB", url: "https://nhb.gov.in/pdf/SCHEME1Guidelinefinal.pdf", cited: true }],
        unverified: [],
      })}`,
    })
  );
}

async function chooseLocation(page: Page, state = "Maharashtra", district = "Pune") {
  await page.getByRole("combobox", { name: "State" }).click();
  await page.getByRole("option", { name: state, exact: true }).click();
  await page.getByRole("combobox", { name: "District" }).click();
  await page.getByRole("option", { name: district, exact: true }).click();
}

test.describe("personas", () => {
  test("a first-time grower goes from the guide through every step to a report and a question", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    await stubAdvisor(page);
    await signUp(page, undefined, { showGuide: true });

    // The first visit explains the app and offers the easy start.
    const guide = page.getByTestId("welcome-guide");
    await expect(guide).toContainText("Plan a greenhouse, step by step");
    await guide.getByRole("button", { name: "Start with a recommended greenhouse" }).click();
    await expect(guide).toBeHidden();

    // Only the location is left; then the design says it is complete and points on.
    await chooseLocation(page);
    await expect(page.getByText("Up to date")).toBeVisible();
    const done = page.getByTestId("design-complete");
    await expect(done).toContainText("Your design is complete");
    await done.getByRole("button", { name: "Next: Site" }).click();

    // Every step answers its question in a plain sentence first, and Next leads on.
    const journey: Array<[string, string, RegExp]> = [
      ["Site", "Cost", /Pune has a .+ climate/],
      ["Cost", "Earnings", /Building this 300 m² greenhouse costs about ₹/],
      ["Earnings", "Loan & subsidy", /(you would sell Tomato worth about|does not cover its running costs)/],
      ["Loan & subsidy", "Risk", /The bank lends about ₹.+ and you put in ₹/],
      ["Risk", "AI summary", /We played out [\d,]+ possible futures/],
    ];
    for (const [step, next, summary] of journey) {
      await expect(page.getByRole("heading", { level: 1, name: step })).toBeVisible();
      await expect(page.getByTestId("in-short")).toContainText(summary, { timeout: 30_000 });

      if (step === "Earnings") {
        // A word they do not know is one tap away.
        await page.getByRole("button", { name: "What does “Payback period” mean?" }).first().click();
        await expect(page.getByText(/How many years of profit it takes to earn back/)).toBeVisible();
        await page.keyboard.press("Escape");
      }
      if (step === "Risk") {
        await expect(page.getByTestId("risk-chance")).toContainText(/\d+%/);
        await expect(page.getByText("Typical result")).toBeVisible();
      }
      await page.getByRole("button", { name: `Next: ${next}` }).click();
    }

    // The optional AI summary: written on request, then included in the report unless switched off.
    await expect(page.getByRole("heading", { level: 1, name: "AI summary" })).toBeVisible();
    await expect(page.getByTestId("in-short")).toContainText("This step is optional");
    await page.getByRole("button", { name: "Generate AI summary" }).click();
    await expect(page.getByTestId("summary-review")).toContainText(VERDICT);
    await expect(page.getByRole("switch", { name: "Include this summary in my report" })).toBeChecked();
    await page.getByRole("button", { name: "Next: Report" }).click();

    // The report says the summary goes in, and downloads for the bank.
    await expect(page.getByRole("heading", { level: 1, name: "Report" })).toBeVisible();
    await expect(page.getByTestId("report-summary-status")).toContainText("will be included");
    await expect(page.getByRole("checkbox", { name: /AI summary \(AI-generated\)/ })).toBeChecked();
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);

    // The advisor opens from the corner, with questions that fit the step, and shows where its answer came from.
    await page.getByTestId("advisor-launcher").click();
    const chat = page.getByTestId("advisor-window");
    await chat.getByRole("button", { name: "What should I tell the bank about this project?" }).click();
    await expect(chat.getByText(ANSWER)).toBeVisible();
    await chat.getByText("Sources (1)").click();
    await expect(chat.getByRole("link", { name: "NHB Scheme-1 guidelines" })).toHaveAttribute("href", /nhb\.gov\.in/);
    // The conversation is still there after closing and reopening the chat.
    await chat.getByRole("button", { name: "Close advisor" }).click();
    await expect(chat).toBeHidden();
    await page.getByTestId("advisor-launcher").click();
    await expect(page.getByTestId("advisor-window").getByText(ANSWER)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a grower comparing options sees each change explained", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = trackPageErrors(page);
    await signUp(page);

    // Jumping ahead too early says what is missing instead of showing empty numbers.
    await goToStep(page, "Earnings");
    await expect(page.getByText("Finish the design first")).toBeVisible();
    await page.getByRole("button", { name: "Go to Design" }).click();
    await expect(page.getByRole("tab", { name: "Design", exact: true })).toHaveAttribute("aria-selected", "true");

    await configureSetup(page);
    await goToStep(page, "Earnings");
    const summary = page.getByTestId("in-short");
    await expect(summary).toContainText("Tomato");

    // Their own yield changes the answer; Reset brings back the published figure.
    const yieldField = page.getByLabel(/^Yield/);
    const published = await yieldField.inputValue();
    const before = await summary.textContent();
    await yieldField.fill(String(Number(published) * 2));
    await expect(summary).not.toHaveText(before ?? "");
    await page.getByRole("button", { name: "Reset" }).first().click();
    await expect(yieldField).toHaveValue(published);

    // Another crop: back to Design, change it, and the Earnings summary follows.
    await goToStep(page, "Design");
    await page.getByTestId("properties-panel").getByRole("button", { name: "Crop", exact: true }).click();
    await page.getByTestId("part-editor").getByRole("radio", { name: /Capsicum/ }).click();
    await expect(page.getByText("Up to date")).toBeVisible();
    await goToStep(page, "Earnings");
    await expect(summary).toContainText("Capsicum");
    expect(errors).toEqual([]);
  });

  test("an advanced user tunes the loan, reads the detail and works in Hindi", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = trackPageErrors(page);
    await signUp(page);
    await configureSetup(page);

    // Loan terms: a longer repayment paid quarterly, and the full yearly table under the details.
    await goToStep(page, "Loan & subsidy");
    const loan = page.getByTestId("loan-panel");
    await loan.getByLabel("Repayment (years, with moratorium)").fill("10");
    await loan.getByRole("radio", { name: "Quarterly" }).click();
    await expect(page.getByTestId("in-short")).toContainText("a quarter");
    await loan.getByText("Show details").click();
    await expect(loan.getByTestId("loan-years").getByRole("row")).toHaveCount(11);

    // Risk over 15 years, with the statistics behind the plain answer.
    await goToStep(page, "Risk");
    await page.getByRole("radio", { name: "15 yrs" }).click();
    await expect(page.getByTestId("in-short")).toContainText("within 15 years", { timeout: 30_000 });
    await page.getByTestId("risk-panel").getByText("Show details").click();
    await expect(page.getByText("Spread of outcomes")).toBeVisible();

    // The Excel workbook for their own analysis.
    await goToStep(page, "Report");
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Excel" }).click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);

    // The same journey in Hindi.
    await page.evaluate(() => window.localStorage.setItem("greenhouse.locale", "hi"));
    await page.reload();
    await page.getByRole("tab", { name: "लागत", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "लागत" })).toBeVisible();
    await expect(page.getByTestId("in-short")).toContainText("संक्षेप में");
    expect(errors).toEqual([]);
  });
});
