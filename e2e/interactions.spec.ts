import { expect, test } from "@playwright/test";
import { trackPageErrors } from "./helpers";

test.describe("interaction layer", () => {
  test("command palette opens with Ctrl+K and navigates", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/");

    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Search pages and actions/i);
    await expect(input).toBeFocused();

    await input.fill("support");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/support/);
    expect(errors).toEqual([]);
  });

  test("palette is reachable from the menu without a keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Guest" }).click();
    await page.getByRole("menuitem", { name: /Search pages and actions/i }).click();
    await expect(page.getByPlaceholder(/Search pages and actions/i)).toBeVisible();
  });

  test("scroll progress bar fills as the page scrolls", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator(".fx-progress");
    await expect(bar).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(async () => bar.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a))
      .toBeGreaterThan(0.5);
  });

  test("feature cards tilt and spotlight follow the pointer", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("[data-tilt]").first();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error("card has no box");
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2, { steps: 8 });
    await expect.poll(() => card.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ry"))).not.toBe("");
    await expect.poll(() => card.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--px"))).toMatch(/px$/);

    // Leaving the card releases the tilt.
    await page.mouse.move(2, 2, { steps: 8 });
    await expect.poll(() => card.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--ry"))).toBe("");
  });

  test("clicking leaves a ripple that cleans itself up", async ({ page }) => {
    await page.goto("/");
    await page.mouse.move(640, 300);
    await page.mouse.click(640, 300);
    await expect(page.locator(".fx-ripple, .fx-sparks").first()).toBeAttached();
    await expect(page.locator(".fx-ripple, .fx-sparks")).toHaveCount(0, { timeout: 3000 });
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("pointer effects are off but the palette still works", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".fx-cursor")).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder(/Search pages and actions/i)).toBeVisible();
  });
});
