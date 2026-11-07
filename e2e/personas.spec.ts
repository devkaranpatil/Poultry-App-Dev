import { expect, test, type Page } from "@playwright/test";
import { goToStep, openAdvisor, signUp, trackPageErrors } from "./helpers";

/**
 * Journeys for the people the planner is for (docs/migration/implementation-plan.md, Phase 7): a first-time broiler
 * farmer on contract, a layer entrepreneur with cages, and a rural parent farm that may qualify for NLM. Each one uses
 * only what is on the screen: the guide, the sidebar, the step bar, the Next buttons, the "?" explanations and the
 * advisor.
 */

const ANSWER = "Show the bank your project report, the land papers and the integrator agreement [1].";

const VERDICT = "A sound first farm if summer heat is managed.";

/** The e2e backend has no AI model, so the advisor's answers are stubbed in the browser. */
async function stubAdvisor(page: Page) {
  await page.route("**/api/ai/status", (route) => route.fulfill({ json: { enabled: true, model: "stub" } }));
  await page.route("**/api/ai/advisor", (route) =>
    route.fulfill({
      json: {
        report: {
          summary: VERDICT,
          verdict: "viable",
          strengths: ["An integrator takes the price risk"],
          risks: [{ title: "Heat stress", detail: "Three hot months", severity: "medium" }],
          recommendations: [{ title: "Add foggers", detail: "Fit roof foggers before April", category: "structure", impact: "Lower summer mortality" }],
        },
      },
    })
  );
  await page.route("**/api/ai/chat", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: `${ANSWER}[[AI_SOURCES]]${JSON.stringify({
        sources: [{ n: 1, title: "NABARD unit costs 2023-24", publisher: "NABARD", url: "https://www.nabard.org/unit-costs.pdf", cited: true }],
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

const sidebarTab = (page: Page, name: string) => page.getByTestId("properties-panel").getByRole("button", { name, exact: true }).click();
const pick = (page: Page, name: string) => page.getByTestId("part-editor").getByRole("radio", { name, exact: true }).click();

/** Types a flock size; the sidebar lengthens the shed to hold it. */
async function setFlock(page: Page, birds: number) {
  await sidebarTab(page, "Size");
  const flock = page.getByRole("spinbutton", { name: "Flock size" });
  await flock.fill(String(birds));
  await flock.blur();
  await expect(page.getByText("Up to date")).toBeVisible();
}

test.describe("personas", () => {
  test("a first-time broiler farmer with 5,000 birds on contract goes from the guide to a report and a question", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    await stubAdvisor(page);
    await signUp(page, undefined, { showGuide: true });

    // The first visit explains the app and offers the easy start.
    const guide = page.getByTestId("welcome-guide");
    await expect(guide).toContainText("Plan a poultry farm, step by step");
    await guide.getByRole("button", { name: "Start with a recommended shed" }).click();
    await expect(guide).toBeHidden();

    // Only the location is left; then the farm model and the flock size.
    await chooseLocation(page);
    await sidebarTab(page, "Birds");
    await pick(page, "Contract");
    await setFlock(page, 5000);
    const done = page.getByTestId("design-complete");
    await expect(done).toContainText("Your design is complete");
    await done.getByRole("button", { name: "Next: Site & rules" }).click();

    // Every step answers its question in a plain sentence first, and Next leads on.
    const journey: Array<[string, string, RegExp]> = [
      ["Site & rules", "Cost", /Pune has a .+ climate/],
      ["Cost", "Earnings", /The integrator pays for the first batch/],
      ["Earnings", "Loan", /(you run [\d.]+ batches of Broiler|does not cover its running costs|does not come back)/],
      ["Loan", "Risk", /The bank lends about ₹.+ and you put in ₹/],
      ["Risk", "AI summary", /We played out [\d,]+ possible futures/],
    ];
    for (const [step, next, summary] of journey) {
      await expect(page.getByRole("heading", { level: 1, name: step })).toBeVisible();
      await expect(page.getByTestId("in-short")).toContainText(summary, { timeout: 30_000 });

      if (step === "Site & rules") {
        // Above 5,000 birds the CPCB rules and the pollution board's consent apply.
        await expect(page.getByTestId("siting-checklist")).toContainText("Consent to establish and operate");
      }
      if (step === "Earnings") {
        await expect(page.getByLabel("Growing charge (₹/kg)", { exact: true })).toBeVisible();
        // A word they do not know is one tap away.
        await page.getByRole("button", { name: "What does “Growing charge (₹/kg)” mean?" }).first().click();
        await expect(page.getByText(/What an integrator pays a contract farmer/)).toBeVisible();
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
    await page.getByRole("button", { name: "Generate AI summary" }).click();
    await expect(page.getByTestId("summary-review")).toContainText(VERDICT);
    await page.getByRole("button", { name: "Next: Report" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Report" })).toBeVisible();
    await expect(page.getByTestId("report-summary-status")).toContainText("will be included");
    const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^farm-pune-.*\.pdf$/);

    // The advisor opens from "More options" and shows where its answer came from.
    const chat = await openAdvisor(page);
    await chat.getByRole("button", { name: "What should I tell the bank about this project?" }).click();
    await expect(chat.getByText(ANSWER)).toBeVisible();
    await chat.getByText("Sources (1)").click();
    await expect(chat.getByRole("link", { name: "NABARD unit costs 2023-24" })).toHaveAttribute("href", /nabard\.org/);
    expect(errors).toEqual([]);
  });

  test("a layer entrepreneur plans 5,000 hens in cages, tunes the loan and works in Hindi", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    await signUp(page);
    await page.getByRole("button", { name: /Use recommended/i }).click();
    await chooseLocation(page, "Maharashtra", "Pune");
    await sidebarTab(page, "Birds");
    await pick(page, "Layers in cages");
    await setFlock(page, 5000);

    // Earnings speak of eggs, with the flock calendar from chick to cull.
    await goToStep(page, "Earnings");
    await expect(page.getByLabel("Egg price (₹)", { exact: true })).toBeVisible();
    await expect(page.getByTestId("batch-calendar")).toContainText("Flock 1");
    const summary = page.getByTestId("in-short");
    const before = await summary.textContent();
    await page.getByLabel("Egg price (₹)", { exact: true }).fill("5");
    await expect(summary).not.toHaveText(before ?? "");
    await page.getByRole("button", { name: "Reset" }).first().click();
    // Reset returns to Maharashtra's own egg price, not the national default.
    await expect(page.getByLabel("Egg price (₹)", { exact: true })).toHaveValue("6.8");

    // NABARD's layer terms: a year of grace while the flock grows to point of lay.
    await goToStep(page, "Loan");
    await expect(page.getByTestId("in-short")).toContainText("After the first 12 months");
    const loan = page.getByTestId("loan-panel");
    await loan.getByRole("radio", { name: "Quarterly" }).click();
    await expect(page.getByTestId("in-short")).toContainText("a quarter");

    // Risk over 15 years, with the statistics behind the plain answer.
    await goToStep(page, "Risk");
    await page.getByRole("radio", { name: "15 yrs" }).click();
    await expect(page.getByTestId("in-short")).toContainText("within 15 years", { timeout: 30_000 });

    // The Excel workbook for the bank.
    await goToStep(page, "Report");
    const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download Excel" }).click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);

    // The same plan in Hindi.
    await page.evaluate(() => window.localStorage.setItem("farm.locale", "hi"));
    await page.reload();
    await goToStep(page, "लागत");
    await expect(page.getByRole("heading", { level: 1, name: "लागत" })).toBeVisible();
    await expect(page.getByTestId("in-short")).toContainText("पक्षियों का शेड");
    expect(errors).toEqual([]);
  });

  test("a rural parent farm of desi birds sees which schemes may apply, and why", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = trackPageErrors(page);
    await signUp(page);

    // Jumping ahead too early says what is missing instead of showing empty numbers.
    await goToStep(page, "Cost");
    await expect(page.locator("main#workspace-main").getByText("Finish the design first")).toBeVisible();
    await page.getByRole("button", { name: "Go to Design" }).click();

    await page.getByRole("button", { name: /Use recommended/i }).click();
    await chooseLocation(page, "Maharashtra", "Nagpur");
    await pick(page, "SC/ST");
    await sidebarTab(page, "Birds");
    await pick(page, "Improved desi");
    await setFlock(page, 1100);

    // NLM covers a rural parent farm of low-input birds: the planner cannot know the breed or the hatchery, so it asks
    // to check; the state scheme pays SC/ST applicants 75%.
    await goToStep(page, "Cost");
    const schemes = page.getByTestId("schemes-card");
    await expect(schemes).toContainText("National Livestock Mission");
    await expect(schemes).toContainText("Confirm the project includes a hatchery");
    await expect(schemes).toContainText("75%");
    await expect(schemes).toContainText("Not eligible"); // AHIDF does not cover farms
    await expect(page.getByTestId("in-short")).toContainText("A scheme may pay up to");

    // Nagpur's summers: heat stress months and the advice that goes with them.
    await goToStep(page, "Site & rules");
    await expect(page.getByTestId("heat-stress")).toContainText("April");
    expect(errors).toEqual([]);
  });
});
