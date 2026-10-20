import { expect, test, type Page } from "@playwright/test";
import { configureSetup, signUp, trackPageErrors } from "./helpers";

type Project = (name: string, centre?: boolean) => { x: number; y: number } | null;

async function waitForScene(page: Page) {
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-build-stage", "6", { timeout: 30_000 });
}

/** Where a named scene object appears on screen (page pixels). */
async function screenPosition(page: Page, name: string, centre = false) {
  const point = await page.evaluate(
    ([target, middle]) => (window as unknown as { __farmProject: Project }).__farmProject(target, middle),
    [name, centre] as const
  );
  expect(point, `${name} is in the scene`).not.toBeNull();
  return point!;
}

const sceneOption = (page: Page, key: string) =>
  page.evaluate((field) => {
    const scene = (window as unknown as { __farmScene: { getObjectByName: (name: string) => { userData: Record<string, unknown> } } }).__farmScene;
    return scene.getObjectByName("farm-model").userData[field];
  }, key);

const hasHandle = (page: Page, name: string) =>
  page.evaluate(
    (target) =>
      Boolean((window as unknown as { __farmScene: { getObjectByName: (name: string) => unknown } }).__farmScene.getObjectByName(target)),
    name
  );

/** Handles show for the selected part only, as in Blender; opening a sidebar tab selects its part. */
async function selectPart(page: Page, name: string) {
  await page.getByTestId("properties-panel").getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("part-editor")).toBeVisible();
}

const dimensions = async (page: Page) => {
  const text = (await page.getByTestId("model-dimensions").textContent()) ?? "";
  const [length, width, ridge] = text.split("×").map((part) => parseFloat(part));
  return { length, width, ridge };
};

test("the recommended shed builds its model before a location is chosen", async ({ page }) => {
  // The location only feeds the money steps; the model must not wait for it.
  await signUp(page);
  await page.getByRole("button", { name: /Use recommended/i }).click();
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-build-stage", "6", { timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = (window as unknown as { __farmScene?: { getObjectByName: (name: string) => unknown } }).__farmScene;
        return Boolean(scene?.getObjectByName("farm-model"));
      })
    )
    .toBe(true);
});

test.describe("editing the model in 3D", () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page);
    await configureSetup(page);
    await waitForScene(page);
  });

  test("dragging the end handle changes the length everywhere", async ({ page }) => {
    const errors = trackPageErrors(page);
    const before = await dimensions(page);
    expect(before.length).toBe(14);

    await selectPart(page, "Size");
    await expect.poll(() => hasHandle(page, "handle-length")).toBe(true);
    const handle = await screenPosition(page, "handle-length");
    const centre = await screenPosition(page, "farm-model");
    // Drag away from the middle of the house, which lengthens it.
    const dx = handle.x - centre.x;
    const dy = handle.y - centre.y;
    const norm = Math.hypot(dx, dy) || 1;
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + (dx / norm) * 60, handle.y + (dy / norm) * 60, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => (await dimensions(page)).length).toBeGreaterThan(14);
    const after = await dimensions(page);
    expect(Number.isInteger(after.length)).toBe(true); // snaps to whole metres
    expect(after.width).toBe(before.width);

    // The sidebar and the scene stay in step with the drag.
    await expect(page.getByTestId("part-editor").getByRole("spinbutton", { name: "Length (m)" })).toHaveValue(String(after.length));
    expect(errors).toEqual([]);
  });

  test("dragging a handle does not orbit the camera", async ({ page }) => {
    await selectPart(page, "Size");
    await expect.poll(() => hasHandle(page, "handle-width")).toBe(true);
    const handle = await screenPosition(page, "handle-width");
    const house = await screenPosition(page, "farm-model");
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 40, handle.y + 10, { steps: 8 });
    await page.mouse.up();
    // With the camera held still the house stays where it was on screen, unless the model grew around its centre.
    const after = await screenPosition(page, "farm-model");
    expect(Math.abs(after.x - house.x)).toBeLessThan(2);
    expect(Math.abs(after.y - house.y)).toBeLessThan(2);
  });

  test("the size editor steps and clamps dimensions", async ({ page }) => {
    await page.getByRole("button", { name: "Size", exact: true }).click();
    const editor = page.getByTestId("part-editor");
    await expect(editor).toHaveAttribute("data-part", "size");

    await editor.getByRole("button", { name: /Length.*\+/ }).click();
    await expect.poll(async () => (await dimensions(page)).length).toBe(14.5);

    const width = editor.getByRole("spinbutton", { name: /Width/ });
    await width.fill("500");
    await width.blur();
    await expect.poll(async () => (await dimensions(page)).width).toBe(18); // the supported maximum

    const eaves = editor.getByRole("spinbutton", { name: /Eaves/ });
    await eaves.fill("9");
    await eaves.blur();
    await expect(eaves).toHaveValue("3.5"); // the tallest eaves the planner supports
  });

  test("G and S change sizes from the keyboard, like Blender", async ({ page }) => {
    await selectPart(page, "Size");
    // Scale along X (the width) by a typed factor, then confirm.
    await page.keyboard.press("s");
    await page.keyboard.press("x");
    await page.keyboard.type("2");
    await expect(page.getByTestId("drag-readout")).toContainText("Scale");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await dimensions(page)).width).toBe(14);
    await expect(page.getByTestId("drag-readout")).toHaveCount(0);

    // Grab along Y (the length) by a typed amount, then cancel: nothing changes.
    await page.keyboard.press("g");
    await page.keyboard.press("y");
    await page.keyboard.type("6");
    await expect.poll(async () => (await dimensions(page)).length).toBe(20);
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await dimensions(page)).length).toBe(14);

    // The confirmed scale is one undo step.
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await dimensions(page)).width).toBe(7);
  });

  test("the surroundings follow the location, and a picked landscape and sky stay after a reload", async ({ page }) => {
    const picker = page.getByTestId("environment-picker");
    // Pune is on the Deccan plateau; Auto follows the location.
    await expect(picker).toHaveAttribute("data-environment", "deccan");
    await expect(picker).toContainText("Auto");

    await picker.click();
    const panel = page.getByTestId("environment-panel");
    await expect(panel).toContainText("Deccan plateau for Pune");
    await panel.getByRole("radio", { name: /Desert/ }).click();
    await panel.getByRole("radio", { name: "Night" }).click();
    await expect(picker).toHaveAttribute("data-environment", "arid");
    await expect(picker).toHaveAttribute("data-sky", "night");
    await expect(picker).not.toContainText("Auto");

    await page.reload();
    await waitForScene(page);
    await expect(picker).toHaveAttribute("data-environment", "arid");
    await expect(picker).toHaveAttribute("data-sky", "night");

    await picker.click();
    await panel.getByRole("radio", { name: /^Auto/ }).click();
    await expect(picker).toHaveAttribute("data-environment", "deccan");
  });

  test("the ridge handle shows once the roof is selected", async ({ page }) => {
    await expect.poll(() => hasHandle(page, "handle-ridgeHeight")).toBe(false); // nothing selected yet
    await selectPart(page, "Roof");
    await expect.poll(() => hasHandle(page, "handle-ridgeHeight")).toBe(true);
  });

  test("clicking a part in the 3D view opens its editor", async ({ page }) => {
    // The door sits in the middle of the front wall; a click that lands on it selects it.
    await page.keyboard.press("6");
    await page.waitForTimeout(1200);
    const door = await screenPosition(page, "entry-door", true);
    await page.mouse.click(door.x, door.y);
    await expect(page.getByTestId("part-editor")).toHaveAttribute("data-part", "entry");
  });

  test("view mode hides the handles, and edit mode brings them back", async ({ page }) => {
    await selectPart(page, "Size");
    await expect.poll(() => hasHandle(page, "handle-length")).toBe(true);
    await page.getByTestId("mode-view").click();
    await expect.poll(() => hasHandle(page, "handle-length")).toBe(false);
    await page.getByTestId("mode-edit").click();
    await selectPart(page, "Size");
    await expect.poll(() => hasHandle(page, "handle-length")).toBe(true);
  });

  test("the design sidebar stays docked beside the model and its tabs follow the 3D selection", async ({ page }) => {
    const sidebar = page.getByTestId("properties-panel");
    const canvas = page.getByTestId("scene-canvas");
    const [side, view] = [(await sidebar.boundingBox())!, (await canvas.boundingBox())!];
    expect(side.x).toBeGreaterThanOrEqual(view.x + view.width - 1); // beside the model, not over it
    // Choosing a part on the model (here through the editor hook) opens its tab.
    await page.evaluate(() => (window as unknown as { __farmEditor: { select: (part: string) => void } }).__farmEditor.select("entry"));
    await expect(page.getByTestId("part-editor")).toHaveAttribute("data-part", "entry");
    await expect(sidebar.getByRole("button", { name: "Entry", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
  test("choosing a PUF roof and automatic curtains warns that no published price exists", async ({ page }) => {
    await page.getByRole("button", { name: "Roof sheet", exact: true }).click();
    await page.getByTestId("part-editor").getByRole("radio", { name: "PUF panel" }).click();
    await page.getByRole("button", { name: "Side walls", exact: true }).click();
    await page.getByTestId("part-editor").getByRole("radio", { name: "Mesh, automatic curtains" }).click();
    await expect(page.getByText("Up to date")).toBeVisible();

    await page.getByRole("tab", { name: "Cost", exact: true }).click();
    const note = page.getByTestId("unsourced-rates");
    await expect(note).toContainText("No published price exists");
    await expect(note).toContainText("puf-panel");
    await expect(note).toContainText("automatic curtains");

    // Back to the standard choices: only the footbath's assumed price is left. Returning keeps the model fully built.
    await page.getByRole("tab", { name: "Design", exact: true }).click();
    await waitForScene(page);
    await page.getByRole("button", { name: "Roof sheet", exact: true }).click();
    await page.getByTestId("part-editor").getByRole("radio", { name: "GI sheet" }).click();
    await page.getByRole("button", { name: "Side walls", exact: true }).click();
    await page.getByTestId("part-editor").getByRole("radio", { name: "Mesh and curtains" }).click();
    await expect(page.getByText("Up to date")).toBeVisible();
    await page.getByRole("tab", { name: "Cost", exact: true }).click();
    await expect(page.getByTestId("unsourced-rates")).not.toContainText("puf-panel");
  });
});
