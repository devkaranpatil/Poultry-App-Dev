import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signUp, trackPageErrors } from "./helpers";

/**
 * Every option the setup offers must produce its own 3D model. These tests open each option through
 * a share link, wait for the scene to finish building, and then inspect what was really built: the
 * named groups, the number of instances per part, and the materials. Screenshots of each option are
 * written to test-results/scene/ so they can be looked at.
 */

const CROPS = ["tomato", "capsicum", "cucumber", "lettuce", "strawberry", "gerbera"] as const;
const IRRIGATION = ["drip", "sprinkler", "fogger", "hydroponic-nft"] as const;
const STRUCTURES = ["naturally-ventilated", "climate-controlled", "shade-net"] as const;
const ROOFS = ["flat", "gable", "gothic"] as const;
const MATERIALS = ["gi-steel", "aluminium", "bamboo"] as const;
const COVERS = ["uv-polyfilm", "shade-net", "insect-net", "glass"] as const;
const VENTS = ["none", "manual-rollup", "motorized-rollup", "louver"] as const;
const DOORS = ["single-sliding", "double-sliding", "roll-up", "curtain"] as const;

const BASE = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  greenhouseType: "naturally-ventilated",
  roofType: "gable",
  structureMaterial: "gi-steel",
  coverMaterial: "uv-polyfilm",
  sideVentilation: "manual-rollup",
  doorEntry: "single-sliding",
  selectedCrop: "tomato",
  irrigationSystem: "drip",
  state: "Maharashtra",
  district: "Pune",
};
type Setup = typeof BASE;

/** Parts every crop must build (the part name is `<crop>-<part>`). */
const CROP_PARTS: Record<(typeof CROPS)[number], string[]> = {
  tomato: ["stems", "strings", "leaves", "fruit", "wires", "posts"],
  capsicum: ["stems", "leaves", "fruit"],
  cucumber: ["stems", "strings", "leaves", "fruit", "wires", "posts"],
  lettuce: ["leaves"],
  strawberry: ["leaves", "fruit", "flowers"],
  gerbera: ["leaves", "stalks", "petals", "centres"],
};

/** Parts every irrigation system must build (the part name is `<system>-<part>`). */
const IRRIGATION_PARTS: Record<(typeof IRRIGATION)[number], string[]> = {
  drip: ["pipes", "emitters", "drops"],
  sprinkler: ["pipes", "heads", "spray"],
  fogger: ["pipes", "nozzles", "plumes", "mist"],
  "hydroponic-nft": ["pipes", "legs", "channel-floors", "channel-walls", "water"],
};

interface SceneInfo {
  root: Record<string, unknown> | null;
  groups: Record<string, number>;
  instanced: Record<string, number>;
  /** `woven` marks a net whose see-through comes from an alpha map (its weave) on top of the opacity. */
  meshes: Record<string, { type: string; color: string; opacity: number; woven: boolean }>;
  /** Largest pitch (rotation about X) among louver slats; slats must tilt about their long axis instead. */
  louverPitch: number;
  louverSlats: number;
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

type View = "inside" | "top" | "irrigation" | "door" | "vents" | "climate";
const VIEW_KEY: Record<View, string> = { inside: "5", top: "4", irrigation: "8", door: "6", vents: "7", climate: "9" };

async function openScene(page: Page, overrides: Partial<Setup> = {}, view?: View) {
  await page.goto(shareUrl(overrides));
  const canvas = page.getByTestId("scene-canvas");
  await expect(canvas).toHaveAttribute("data-build-stage", "6", { timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __farmScene?: unknown }).__farmScene));
  await page.waitForFunction(
    () => {
      const scene = (window as unknown as { __farmScene: { getObjectByName(name: string): unknown } }).__farmScene;
      return Boolean(scene.getObjectByName("interior"));
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
      isMesh?: boolean;
      rotation?: { x: number };
      material?: { type: string; color?: { getHexString(): string }; opacity: number; alphaMap?: unknown };
      traverse(callback: (child: Obj) => void): void;
    };
    const scene = (window as unknown as { __farmScene: Obj }).__farmScene;
    const info: SceneInfo = { root: null, groups: {}, instanced: {}, meshes: {}, louverPitch: 0, louverSlats: 0 };
    scene.traverse((object) => {
      if (object.name === "farm-model") info.root = object.userData;
      if (object.name === "louver-slat") {
        info.louverSlats += 1;
        info.louverPitch = Math.max(info.louverPitch, Math.abs(object.rotation?.x ?? 0));
      }
      if (object.name) info.groups[object.name] = (info.groups[object.name] ?? 0) + 1;
      if (object.isInstancedMesh && object.name) info.instanced[object.name] = object.count ?? 0;
      if (object.isMesh && object.name && object.material && !Array.isArray(object.material)) {
        info.meshes[object.name] = {
          type: object.material.type,
          color: object.material.color ? object.material.color.getHexString() : "",
          opacity: object.material.opacity,
          woven: Boolean(object.material.alphaMap),
        };
      }
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

// Tagged @scene: a long sweep on software WebGL, run by its own CI workflow (scene-e2e.yml), not on every push.
test.describe("3D models for every option", { tag: "@scene" }, () => {
  test.beforeEach(async ({ page }) => {
    // Balanced is what most machines run; it keeps the software-rendered test fast.
    await page.addInitScript(() => window.localStorage.setItem("farm.qualityMode", "balanced"));
    await signUp(page);
  });

  test("each crop builds its own distinct model", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const shots: Record<string, Buffer> = {};

    for (const crop of CROPS) {
      await openScene(page, { selectedCrop: crop }, "inside");
      const scene = await inspect(page);

      expect(scene.root?.crop, `${crop}: root crop`).toBe(crop);
      expect(scene.groups[`crop-${crop}`], `${crop}: crop group`).toBe(1);
      for (const other of CROPS.filter((c) => c !== crop)) expect(scene.groups[`crop-${other}`], `${crop}: no ${other}`).toBeUndefined();
      for (const part of CROP_PARTS[crop]) {
        expect(scene.instanced[`${crop}-${part}`] ?? 0, `${crop}-${part} instances`).toBeGreaterThan(0);
      }
      expect(scene.groups["growing-beds"], `${crop}: soil beds`).toBe(1);

      shots[crop] = await snap(page, testInfo, `crop-${crop}-inside`);
      expect(await contrast(page, shots[crop]), `${crop}: image is not blank`).toBeGreaterThan(8);
    }

    // No two crops may look alike.
    for (let i = 0; i < CROPS.length; i += 1) {
      for (let j = i + 1; j < CROPS.length; j += 1) {
        const difference = await pixelDifference(page, shots[CROPS[i]], shots[CROPS[j]]);
        expect(difference, `${CROPS[i]} vs ${CROPS[j]} look different`).toBeGreaterThan(1.5);
      }
    }
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("each irrigation system builds its own distinct model", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const shots: Record<string, Buffer> = {};

    for (const system of IRRIGATION) {
      await openScene(page, { irrigationSystem: system, selectedCrop: system === "hydroponic-nft" ? "lettuce" : "tomato" }, "irrigation");
      const scene = await inspect(page);

      expect(scene.root?.irrigation, `${system}: root irrigation`).toBe(system);
      expect(scene.groups[`irrigation-${system}`], `${system}: group`).toBe(1);
      for (const other of IRRIGATION.filter((s) => s !== system)) expect(scene.groups[`irrigation-${other}`], `${system}: no ${other}`).toBeUndefined();
      expect(scene.groups[`pump-house-${system}`], `${system}: pump house`).toBe(1);
      for (const part of IRRIGATION_PARTS[system]) {
        expect(scene.instanced[`${system}-${part}`] ?? 0, `${system}-${part} instances`).toBeGreaterThan(0);
      }

      if (system === "hydroponic-nft") {
        // Plants sit in net pots on raised tables, not in soil beds.
        expect(scene.groups["growing-beds"], "no soil beds on NFT tables").toBeUndefined();
        expect(scene.instanced["lettuce-net-pots"] ?? 0).toBeGreaterThan(0);
      } else {
        expect(scene.groups["growing-beds"], `${system}: soil beds`).toBe(1);
      }

      shots[system] = await snap(page, testInfo, `irrigation-${system}-view`);
      expect(await contrast(page, shots[system]), `${system}: image is not blank`).toBeGreaterThan(8);
    }

    for (let i = 0; i < IRRIGATION.length; i += 1) {
      for (let j = i + 1; j < IRRIGATION.length; j += 1) {
        const difference = await pixelDifference(page, shots[IRRIGATION[i]], shots[IRRIGATION[j]]);
        expect(difference, `${IRRIGATION[i]} vs ${IRRIGATION[j]} look different`).toBeGreaterThan(1.5);
      }
    }
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the water in every irrigation system is animated", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    for (const system of IRRIGATION) {
      await openScene(page, { irrigationSystem: system, selectedCrop: system === "hydroponic-nft" ? "lettuce" : "tomato" }, "irrigation");
      const first = await snap(page, testInfo, `motion-${system}-a`);
      await page.waitForTimeout(900);
      const second = await snap(page, testInfo, `motion-${system}-b`);
      expect(await pixelDifference(page, first, second), `${system}: frames differ over time`).toBeGreaterThan(0.05);
    }
  });

  test("every structure type and roof shape builds", async ({ page }, testInfo) => {
    test.setTimeout(480_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const shots: Buffer[] = [];

    for (const type of STRUCTURES) {
      for (const roof of ROOFS) {
        const overrides: Partial<Setup> = { greenhouseType: type, roofType: roof };
        if (roof === "flat") overrides.ridgeHeight = BASE.gutterHeight;
        if (type === "shade-net") Object.assign(overrides, { coverMaterial: "shade-net", sideVentilation: "none", doorEntry: "curtain" });
        await openScene(page, overrides);
        const scene = await inspect(page);

        expect(scene.root, `${type}/${roof}: root`).toMatchObject({ structureType: type, roof });
        if (type === "shade-net") {
          expect(scene.groups["shade-net-structure"], `${type}/${roof}: shade net`).toBe(1);
          expect(scene.groups["roof-cover"], `${type}/${roof}: no film roof`).toBeUndefined();
        } else {
          expect(scene.groups["roof-cover"], `${type}/${roof}: roof cover`).toBe(1);
          expect(scene.groups["side-wall-cover"], `${type}/${roof}: side walls`).toBe(1);
          expect(scene.groups["end-wall-cover"], `${type}/${roof}: end walls`).toBe(1);
        }
        if (type === "climate-controlled") expect(scene.groups["climate-equipment"], `${type}/${roof}: fans and pads`).toBe(1);
        else expect(scene.groups["climate-equipment"], `${type}/${roof}: no fans`).toBeUndefined();

        shots.push(await snap(page, testInfo, `structure-${type}-${roof}`));
      }
    }
    // Nine different buildings: every pair must be visibly different. The canvas fills the whole window now,
    // so the same change touches about half the share of pixels it used to (identical renders score about 0).
    for (let i = 0; i < shots.length; i += 1) {
      for (let j = i + 1; j < shots.length; j += 1) {
        expect(await pixelDifference(page, shots[i], shots[j]), `structure shots ${i} vs ${j}`).toBeGreaterThan(0.15);
      }
    }
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every cover material and frame material builds", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const materialShots: Buffer[] = [];
    const roofColors = new Set<string>();

    for (const cover of COVERS) {
      await openScene(page, { coverMaterial: cover });
      const scene = await inspect(page);
      expect(scene.root?.cover).toBe(cover);
      const roof = scene.meshes["roof-cover-film"];
      expect(roof, `${cover}: roof mesh`).toBeDefined();
      // Film and glass are physically based (transmission); nets are plain translucent standard materials.
      expect(roof.type, `${cover}: material`).toBe(cover === "uv-polyfilm" || cover === "glass" ? "MeshPhysicalMaterial" : "MeshStandardMaterial");
      // A woven net's alpha map lets at most half of its opacity through on average.
      expect(roof.woven ? roof.opacity * 0.5 : roof.opacity, `${cover}: see-through`).toBeLessThan(0.7);
      roofColors.add(roof.color);
      await snap(page, testInfo, `cover-${cover}`);
    }
    expect(roofColors.size, "each cover has its own colour").toBe(COVERS.length);

    for (const material of MATERIALS) {
      await openScene(page, { structureMaterial: material }, "inside");
      const scene = await inspect(page);
      expect(scene.root?.structure).toBe(material);
      materialShots.push(await snap(page, testInfo, `frame-${material}`));
    }
    for (let i = 0; i < materialShots.length; i += 1) {
      for (let j = i + 1; j < materialShots.length; j += 1) {
        expect(await pixelDifference(page, materialShots[i], materialShots[j]), `frame ${i} vs ${j}`).toBeGreaterThan(0.3);
      }
    }
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every side ventilation and door option builds", async ({ page }, testInfo) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);

    for (const vent of VENTS) {
      await openScene(page, { sideVentilation: vent }, "vents");
      const scene = await inspect(page);
      expect(scene.root?.sideVentilation).toBe(vent);
      for (const other of VENTS) {
        const present = scene.groups[`vents-${other}`];
        if (other === vent && vent !== "none") expect(present, `vent ${vent}`).toBe(1);
        else expect(present, `vent ${vent}: no ${other}`).toBeUndefined();
      }
      if (vent === "louver") {
        expect(scene.louverSlats, "louver slats").toBeGreaterThan(8);
        expect(scene.louverPitch, "slats tilt about their long axis, never along it").toBeLessThan(0.01);
      } else {
        expect(scene.louverSlats, `${vent}: no louver slats`).toBe(0);
      }
      await snap(page, testInfo, `vent-${vent}`);
    }

    for (const door of DOORS) {
      await openScene(page, { doorEntry: door }, "door");
      const scene = await inspect(page);
      expect(scene.root?.door).toBe(door);
      for (const other of DOORS) {
        const present = scene.groups[`door-${other}`];
        if (other === door) expect(present, `door ${door}`).toBe(1);
        else expect(present, `door ${door}: no ${other}`).toBeUndefined();
      }
      await snap(page, testInfo, `door-${door}`);
    }
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the setup controls change the 3D model", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    await openScene(page, { selectedCrop: "tomato", irrigationSystem: "drip" });

    // The sidebar tab for the part, then the option's card.
    const choose = async (tab: string, option: RegExp) => {
      await page.getByTestId("properties-panel").getByRole("button", { name: tab, exact: true }).click();
      await page.getByTestId("part-editor").getByRole("radio", { name: option }).click();
    };

    await choose("Crop", /Gerbera/);
    await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-crop", "gerbera");
    await page.waitForFunction(() => {
      const scene = (window as unknown as { __farmScene: { getObjectByName(name: string): unknown } }).__farmScene;
      return Boolean(scene.getObjectByName("crop-gerbera"));
    });

    await choose("Irrigation", /Hydroponic/);
    await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-irrigation", "hydroponic-nft");
    await page.waitForFunction(() => {
      const scene = (window as unknown as { __farmScene: { getObjectByName(name: string): unknown } }).__farmScene;
      return Boolean(scene.getObjectByName("irrigation-hydroponic-nft"));
    });

    const scene = await inspect(page);
    expect(scene.groups["crop-tomato"]).toBeUndefined();
    expect(scene.groups["irrigation-drip"]).toBeUndefined();
    expect(scene.instanced["gerbera-petals"]).toBeGreaterThan(0);
    expect(scene.instanced["hydroponic-nft-water"]).toBeGreaterThan(0);
    await page.keyboard.press("5");
    await page.waitForTimeout(1500);
    await snap(page, testInfo, "controls-gerbera-nft");

    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("climate-controlled equipment builds with the right options", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);

    await openScene(page, { greenhouseType: "climate-controlled" }, "climate");
    const scene = await inspect(page);
    expect(scene.groups["climate-equipment"], "fans and cooling pads").toBe(1);
    const closeUp = await snap(page, testInfo, "climate-controlled-equipment");
    expect(await contrast(page, closeUp), "close-up is not blank").toBeGreaterThan(8);

    // A naturally ventilated house has none of it, and the Climate shortcut stays inactive.
    await openScene(page, { greenhouseType: "naturally-ventilated" });
    expect((await inspect(page)).groups["climate-equipment"]).toBeUndefined();
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("every quality level renders without errors, with more detail on higher levels", async ({ page }) => {
    test.setTimeout(420_000);
    const errors = trackPageErrors(page);
    const consoleErrors = trackConsoleErrors(page);
    const plants: Record<string, number> = {};
    // The shared beforeEach script resets the quality on every load; this one runs after it and wins.
    await page.addInitScript(() => {
      const wanted = window.sessionStorage.getItem("testQuality");
      if (wanted) window.localStorage.setItem("farm.qualityMode", wanted);
    });

    for (const quality of ["lite", "balanced", "high"] as const) {
      await page.evaluate((q) => window.sessionStorage.setItem("testQuality", q), quality);
      for (const [crop, system] of [["tomato", "fogger"], ["gerbera", "sprinkler"], ["lettuce", "hydroponic-nft"]] as const) {
        await openScene(page, { selectedCrop: crop, irrigationSystem: system });
        const scene = await inspect(page);
        expect(scene.root?.quality, `${quality}: root quality`).toBe(quality);
        expect(scene.groups[`crop-${crop}`], `${quality}/${crop}`).toBe(1);
        expect(scene.groups[`irrigation-${system}`], `${quality}/${system}`).toBe(1);
        if (crop === "tomato") {
          plants[quality] = Object.entries(scene.instanced)
            .filter(([name]) => name.startsWith("tomato-"))
            .reduce((sum, [, count]) => sum + count, 0);
        }
      }
    }
    expect(plants.balanced, "balanced draws more than lite").toBeGreaterThan(plants.lite);
    expect(plants.high, "high draws more than balanced").toBeGreaterThan(plants.balanced);
    expect(errors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("an accessible description names what is on screen", async ({ page }) => {
    await openScene(page, { selectedCrop: "strawberry", irrigationSystem: "sprinkler" });
    const label = await page.getByTestId("scene-canvas").getAttribute("aria-label");
    expect(label).toMatch(/30 by 10 metre naturally ventilated/);
    expect(label).toMatch(/growing strawberry with sprinkler irrigation/);
  });
});
