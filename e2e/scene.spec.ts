import { expect, test } from "@playwright/test";
import { configureSetup, signUp, trackPageErrors } from "./helpers";

test.describe("3D scene", () => {
  // Regression: the dust particles were resized in place when the quality level changed while the
  // building was being resized, and WebGL then threw "Resizing buffer attributes is not supported"
  // on every frame (160+ errors from four resizes).
  test("resizing the building never breaks the render loop", async ({ page }) => {
    const errors = trackPageErrors(page);
    await signUp(page);
    await configureSetup(page);
    await expect(page.locator("canvas").first()).toBeVisible();

    await page.getByTestId("properties-panel").getByRole("button", { name: "Size", exact: true }).click();
    for (const [dimension, value] of [["length", "60"], ["length", "20"], ["width", "25"], ["length", "90"]]) {
      const field = page.locator(`#edit-size-${dimension}`);
      await field.fill(value);
      await field.blur();
      await page.waitForTimeout(1200);
    }

    expect(errors.filter((message) => /WebGLAttributes|Resizing buffer/i.test(message))).toEqual([]);
    expect(errors).toEqual([]);
  });
});
