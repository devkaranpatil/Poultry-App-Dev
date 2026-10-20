import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signUp, trackPageErrors } from "./helpers";

/**
 * Every option the setup offers must produce its own 3D shed. These tests open each option through a share link,
 * wait for the scene to finish building, and then inspect what was really built: the named groups, the number of
 * instances per part, and the setup the model says it drew. Screenshots of each option are written to
 * test-results/scene/ so they can be looked at against docs/3d-model-references.md.
 */

const BIRDS = ["broiler", "layer-cage", "layer-floor", "desi"] as const;
const ROOFS = ["gable", "monitor", "lean-to"] as const;
const SHEETS = ["gi-sheet", "galvalume", "fibre-cement", "puf-panel"] as const;
const WALLS = ["mesh-curtain", "mesh-auto-curtain"] as const;
const ENTRIES = ["single-door", "door-footbath", "anteroom"] as const;

const BASE = {
  length: 14,
  width: 7,
  eavesHeight: 2.1,
  ridgeHeight: 3.5,
  housingSystem: "open-sided",
  roofType: "gable",
  frameMaterial: "steel-truss",
  roofSheet: "gi-sheet",
  sideWalls: "mesh-curtain",
  entry: "door-footbath",
  birdType: "broiler",
  stockingDensity: null as number | null,
  cageTiers: 3,
  feedingSystem: "manual",
  farmingModel: "independent",
  beneficiaryCategory: "general",
  state: "Maharashtra",
  district: "Nagpur",
};
type Setup = typeof BASE;
/** A controlled tunnel shed: closed walls, pads and fans. */
const CONTROLLED: Partial<Setup> = { housingSystem: "environment-controlled", sideWalls: "closed-tunnel", width: 12, eavesHeight: 2.6, ridgeHeight: 4 };
/** A backyard shed for improved desi birds: bamboo frame and a fenced run. */
const BACKYARD: Partial<Setup> = { housingSystem: "backyard", birdType: "desi", frameMaterial: "bamboo-wood" };

interface SceneInfo {
  root: Record<string, unknown> | null;
  groups: Record<string, number>;
  instanced: Record<string, number>;
}

function shareUrl(overrides: Partial<Setup>) {
  const payload = Buffer.from(JSON.stringify({ ...BASE, ...overrides })).toString("base64url");
  return `/visualizer?setup=${payload}`;
}

/** Console errors that matter: shader compile failures, WebGL errors, and uncaught exceptions. */
function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Failed to load resource/i.test(text)) return;
    errors.push(text.slice(0, 300));
  });
  return errors;
}

type View = "inside" | "top" | "feeding" | "entry" | "walls" | "fans";
const VIEW_KEY: Record<View, string> = { inside: "5", top: "4", feeding: "8", entry: "6", walls: "7", fans: "9" };

async function openScene(page: Page, overrides: Partial<Setup> = {}, view?: View) {
  await page.goto(shareUrl(overrides));
  const canvas = page.getByTestId("scene-canvas");
  await expect(canvas).toHaveAttribute("data-build-stage", "6", { timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __farmScene?: unknown }).__farmScene));
  await page.waitForFunction(
    () => {
      const scene = (window as unknown as { __farmScene: { getObjectByName(name: string): unknown } }).__farmScene;
      return Boolean(scene.getObjectByName("birds-flock"));
    },
    undefined,
    { timeout: 30_000 }
  );
  if (view) {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press(VIEW_KEY[view]);
  }
  await page.waitForTimeout(1800);
  return canvas;
}

async function inspect(page: Page): Promise<SceneInfo> {
  return page.evaluate(() => {
    type Obj = {
      name: string;
      userData: Record<string, unknown>;
      isInstancedMesh?: boolean;
      count?: number;
      traverse(callback: (child: Obj) => void): void;
    };
    const scene = (window as unknown as { __farmScene: Obj }).__farmScene;
    const info: SceneInfo = { root: null, groups: {}, instanced: {} };
    scene.traverse((object) => {
      // Parts animating out carry a "leaving:" prefix; only the live model counts.
      if (object.name.startsWith("leaving:")) return;
      if (object.name === "farm-model") info.root = object.userData;
      if (object.name) info.groups[object.name] = (info.groups[object.name] ?? 0) + 1;
      if (object.isInstancedMesh && object.name) info.instanced[object.name] = object.count ?? 0;
    });
    return info;
  });
}

/** Mean per-channel difference (0 to 255) between two screenshots, after shrinking them. */
async function pixelDifference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
      const [imageA, imageB] = await Promise.all([load(first), load(second)]);
      const width = 200;
      const height = Math.max(1, Math.round((width * imageA.height) / imageA.width));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(imageA, 0, 0, width, height);
      const dataA = context.getImageData(0, 0, width, height).data;
      context.clearRect(0, 0, width, height);
      context.drawImage(imageB, 0, 0, width, height);
      const dataB = context.getImageData(0, 0, width, height).data;
      let total = 0;
      for (let i = 0; i < dataA.length; i += 4) {
        total += Math.abs(dataA[i] - dataB[i]) + Math.abs(dataA[i + 1] - dataB[i + 1]) + Math.abs(dataA[i + 2] - dataB[i + 2]);
      }
      return total / (dataA.length / 4) / 3;
    },
    [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]
  );
}

/** Standard deviation of brightness: a blank or single-colour canvas scores near zero. */
async function contrast(page: Page, image: Buffer): Promise<number> {
  return page.evaluate(async (src) => {
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(element, 0, 0, 120, 80);
    const data = context.getImageData(0, 0, 120, 80).data;
    const values: number[] = [];
    for (let i = 0; i < data.length; i += 4) values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  }, `data:image/png;base64,${image.toString("base64")}`);
}

async function snap(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  // The floating panels are the same in every shot; hide them while capturing so comparisons measure the model alone.
  const hide = await page.addStyleTag({ content: "main aside, .canvas-container ~ div.pointer-events-none { visibility: hidden !important; }" });
  const buffer = await page.getByTestId("scene-canvas").screenshot({ path: `test-results/scene/${name}.png` });
  await hide.evaluate((node) => node.remove());
  await testInfo.attach(name, { body: buffer, contentType: "image/png" });
  return buffer;
}

/** Every pair of shots must be visibly different (identical renders score about 0). */
async function allDifferent(page: Page, shots: Record<string, Buffer>, threshold: number) {
  const names = Object.keys(shots);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      expect(await pixelDifference(page, shots[names[i]], shots[names[j]]), `${names[i]} vs ${names[j]} look different`).toBeGreaterThan(threshold);
    }
  }
}

// Tagged @scene: a long sweep on software WebGL, run by its own CI workflow (scene-e2e.yml), not on every push.
test.describe("3D models for every option", { tag: "@scene" }, () => {
  test.beforeEach(async ({ page }) => {
    // Balanced is what most machines run; it keeps the software-rendered test fast.
    await page.addInitScript(() => window.localStorage.setItem("farm.qualityMode", "balanced"));
    await signUp(page);
  });

  test("each bird builds its own flock: litter for floor birds, A-type cages for layers", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const shots: Record<string, Buffer> = {};

    for (const bird of BIRDS) {
      const overrides: Partial<Setup> = { birdType: bird, feedingSystem: bird === "layer-cage" ? "trough" : "manual" };
      await openScene(page, overrides, "inside");
      const scene = await inspect(page);

      expect(scene.root?.bird, `${bird}: root bird`).toBe(bird);
      expect(scene.instanced["birds-bodies"] ?? 0, `${bird}: birds`).toBeGreaterThan(0);
      expect(scene.instanced["birds-bodies"], `${bird}: one detail per bird`).toBe(scene.instanced["birds-details"]);
      expect(scene.root?.birdsShown, `${bird}: the flock drawn`).toBe(scene.instanced["birds-bodies"]);
      if (bird === "layer-cage") {
        expect(scene.groups["cages-rows"], "cage rows").toBe(1);
        expect(scene.instanced["cages-boxes"] ?? 0).toBeGreaterThan(0);
        expect(scene.groups["litter"], "no litter under cages").toBeUndefined();
      } else {
        expect(scene.groups["litter"], `${bird}: litter`).toBe(1);
        expect(scene.groups["cages-rows"], `${bird}: no cages`).toBeUndefined();
      }

      shots[bird] = await snap(page, testInfo, `bird-${bird}-inside`);
      expect(await contrast(page, shots[bird]), `${bird}: image is not blank`).toBeGreaterThan(8);
    }
    await allDifferent(page, shots, 1);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every shed type and roof shape builds", async ({ page }, testInfo) => {
    test.setTimeout(480_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const shots: Record<string, Buffer> = {};
    const housings = { "open-sided": {}, "environment-controlled": CONTROLLED, backyard: BACKYARD } as const;

    for (const [housing, setup] of Object.entries(housings)) {
      for (const roof of ROOFS) {
        await openScene(page, { ...setup, roofType: roof });
        const scene = await inspect(page);

        expect(scene.root, `${housing}/${roof}: root`).toMatchObject({ housing, roof });
        expect(scene.groups["roof-model"], `${housing}/${roof}: roof`).toBe(1);
        expect(scene.groups["roof-vent"], `${housing}/${roof}: monitor vent`).toBe(roof === "monitor" ? 1 : undefined);
        expect(scene.groups["roof-ridge"], `${housing}/${roof}: ridge cap`).toBe(roof === "lean-to" ? undefined : 1);
        expect(scene.groups["walls-model"], `${housing}/${roof}: walls`).toBe(1);
        const controlled = housing === "environment-controlled";
        expect(scene.groups["tunnel-equipment"], `${housing}/${roof}: pads and fans`).toBe(controlled ? 1 : undefined);
        expect(scene.groups["walls-solid"], `${housing}/${roof}: closed walls`).toBe(controlled ? 1 : undefined);
        expect(scene.groups["walls-run"], `${housing}/${roof}: fenced run`).toBe(housing === "backyard" ? 1 : undefined);
        expect(scene.instanced["frame-posts"] ?? 0, `${housing}/${roof}: posts`).toBeGreaterThan(0);

        shots[`${housing}-${roof}`] = await snap(page, testInfo, `shed-${housing}-${roof}`);
      }
    }
    await allDifferent(page, shots, 0.15);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every frame and roof sheet builds and looks its own", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const frames: Record<string, Buffer> = {};
    const sheets: Record<string, Buffer> = {};

    for (const [frame, setup] of [["steel-truss", {}], ["rcc-pillars", {}], ["bamboo-wood", BACKYARD]] as const) {
      await openScene(page, { ...setup, frameMaterial: frame }, "inside");
      const scene = await inspect(page);
      expect(scene.root?.frame).toBe(frame);
      expect(scene.instanced["frame-members"] ?? 0, `${frame}: members`).toBeGreaterThan(0);
      frames[frame] = await snap(page, testInfo, `frame-${frame}`);
    }
    await allDifferent(page, frames, 0.3);

    for (const [sheet, setup] of [...SHEETS.map((value) => [value, {}] as const), ["thatch", BACKYARD] as const]) {
      await openScene(page, { ...setup, roofSheet: sheet });
      const scene = await inspect(page);
      expect(scene.root?.roofSheet).toBe(sheet);
      expect(scene.groups["roof-sheet"], `${sheet}: sheets`).toBe(1);
      sheets[sheet] = await snap(page, testInfo, `sheet-${sheet}`);
    }
    await allDifferent(page, sheets, 0.15);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every side wall and entry option builds", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);

    for (const walls of WALLS) {
      await openScene(page, { sideWalls: walls }, "walls");
      const scene = await inspect(page);
      expect(scene.root?.sideWalls).toBe(walls);
      expect(scene.groups["walls-low"], `${walls}: low wall`).toBe(1);
      expect(scene.groups["walls-mesh"], `${walls}: mesh`).toBe(1);
      expect(scene.groups["walls-curtains"], `${walls}: curtains`).toBe(1);
      expect(scene.groups["walls-winch"], `${walls}: winch`).toBe(walls === "mesh-auto-curtain" ? 1 : undefined);
      await snap(page, testInfo, `walls-${walls}`);
    }

    for (const entry of ENTRIES) {
      await openScene(page, { entry }, "entry");
      const scene = await inspect(page);
      expect(scene.root?.entry).toBe(entry);
      expect(scene.groups["entry-door"], `${entry}: door`).toBe(1);
      expect(scene.groups["entry-footbath"], `${entry}: footbath`).toBe(entry === "single-door" ? undefined : 1);
      expect(scene.groups["entry-anteroom"], `${entry}: anteroom`).toBe(entry === "anteroom" ? 1 : undefined);
      await snap(page, testInfo, `entry-${entry}`);
    }
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every feeding system builds its own fittings", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const shots: Record<string, Buffer> = {};
    const setups = [
      ["manual", {}],
      ["semi-auto", {}],
      ["automatic", {}],
      ["trough", { birdType: "layer-cage" }],
      ["automatic-cages", { birdType: "layer-cage" }],
    ] as const;

    for (const [name, setup] of setups) {
      const feeding = name === "automatic-cages" ? "automatic" : name;
      await openScene(page, { ...setup, feedingSystem: feeding }, "feeding");
      const scene = await inspect(page);
      expect(scene.root?.feeding).toBe(feeding);
      expect(scene.groups["feeding-model"], `${name}: fittings`).toBe(1);
      if (name === "manual") {
        expect(scene.instanced["feeding-plastic"] ?? 0, "round feeders").toBeGreaterThan(0);
        expect(scene.instanced["feeding-drinkers"] ?? 0, "bell drinkers").toBeGreaterThan(0);
      } else {
        expect(scene.instanced["feeding-lines"] ?? 0, `${name}: lines or troughs`).toBeGreaterThan(0);
      }
      expect(scene.groups["feeding-silo"], `${name}: silo`).toBe(feeding === "automatic" ? 1 : undefined);
      shots[name] = await snap(page, testInfo, `feeding-${name}`);
    }
    await allDifferent(page, shots, 0.3);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the setup controls change the 3D model", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    await openScene(page);

    // The sidebar tab for the part, then the option's card.
    const choose = async (tab: string, option: RegExp) => {
      await page.getByTestId("properties-panel").getByRole("button", { name: tab, exact: true }).click();
      await page.getByTestId("part-editor").getByRole("radio", { name: option }).click();
    };

    await choose("Birds", /Layers in cages/);
    await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-bird", "layer-cage");
    await page.waitForFunction(() => {
      const scene = (window as unknown as { __farmScene: { getObjectByName(name: string): unknown } }).__farmScene;
      return Boolean(scene.getObjectByName("cages-rows"));
    });

    await choose("Feeding", /Automatic lines/);
    await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-feeding", "automatic");
    await page.waitForFunction(() => {
      const scene = (window as unknown as { __farmScene: { getObjectByName(name: string): unknown } }).__farmScene;
      return Boolean(scene.getObjectByName("feeding-silo"));
    });

    const scene = await inspect(page);
    expect(scene.groups["litter"]).toBeUndefined();
    expect(scene.instanced["cages-boxes"]).toBeGreaterThan(0);
    await page.keyboard.press("5");
    await page.waitForTimeout(1500);
    await snap(page, testInfo, "controls-layer-cages-automatic");

    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a controlled shed shows its tunnel fans; an open shed has none", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);

    await openScene(page, CONTROLLED, "fans");
    const scene = await inspect(page);
    expect(scene.groups["tunnel-fans"], "fans").toBe(1);
    expect(scene.groups["tunnel-pads"], "cooling pads").toBe(1);
    const closeUp = await snap(page, testInfo, "tunnel-fans");
    expect(await contrast(page, closeUp), "close-up is not blank").toBeGreaterThan(8);

    await openScene(page);
    expect((await inspect(page)).groups["tunnel-equipment"]).toBeUndefined();
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every quality level renders without errors, with more birds on higher levels", async ({ page }) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const drawn: Record<string, number> = {};
    // The shared beforeEach script resets the quality on every load; this one runs after it and wins.
    await page.addInitScript(() => {
      const wanted = window.sessionStorage.getItem("testQuality");
      if (wanted) window.localStorage.setItem("farm.qualityMode", wanted);
    });

    for (const quality of ["lite", "balanced", "high"] as const) {
      await page.evaluate((q) => window.sessionStorage.setItem("testQuality", q), quality);
      // 40 x 10 m holds about 4,300 broilers: more than any quality draws.
      await openScene(page, { length: 40, width: 10 });
      const scene = await inspect(page);
      expect(scene.root?.quality, `${quality}: root quality`).toBe(quality);
      expect(scene.root?.birdsTotal as number).toBeGreaterThan(4000);
      drawn[quality] = scene.instanced["birds-bodies"] ?? 0;
    }
    expect(drawn.balanced, "balanced draws more than lite").toBeGreaterThan(drawn.lite);
    expect(drawn.high, "high draws more than balanced").toBeGreaterThan(drawn.balanced);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("an accessible description names what is on screen", async ({ page }) => {
    await openScene(page, { birdType: "layer-floor" });
    const label = await page.getByTestId("scene-canvas").getAttribute("aria-label");
    expect(label).toMatch(/14 × 7 m poultry shed: Open-sided/);
    expect(label).toMatch(/Layers on litter birds, Manual feeding/);
  });
});
