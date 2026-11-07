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

  // The cursor follower, tilt, spotlight, ripple and scroll bar were removed in the 2026-11 redesign (decoration
  // without a purpose); sections now fade in with a CSS scroll reveal instead.
  test("sections below the fold reveal as they scroll into view", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#bank .reveal").first();
    await section.scrollIntoViewIfNeeded();
    await expect.poll(() => section.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("scroll reveals are off but the palette still works", async ({ page }) => {
    await page.goto("/");
    // With reduced motion the reveal never hides anything: a section far below is fully visible before scrolling.
    await expect.poll(() => page.locator("#faq").evaluate((el) => Number(getComputedStyle(el.querySelector("h2")!).opacity))).toBe(1);
    await expect(page.locator(".reveal").first()).toHaveCSS("animation-name", "none");
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder(/Search pages and actions/i)).toBeVisible();
  });
});
