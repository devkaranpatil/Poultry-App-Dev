# The 3D scene

How the greenhouse visualizer builds what you see, and how it is tested.

## Where things live

```
src/components/greenhouse/
  GreenhouseModel.tsx        structure, cover, roof, vents, door, climate equipment (the building)
  MiddlePanel.tsx            canvas, camera shortcuts, quality level, accessible description
  CameraController.tsx       the camera presets (keys 1 to 9)
  scene/
    cropLayout.ts            where beds, rows and plants go (pure, unit-tested)
    cropParts.ts             the six crop models, built as instanced parts
    CropField.tsx            beds (or net pots) plus all crop parts
    irrigationParts.ts       the four irrigation systems, built as instanced parts
    IrrigationSystem.tsx     the parts plus the pump house
    sceneGeometry.ts         shared geometry: curved leaves, petals, peppers, berries, cucumbers
    sceneMaterials.ts        materials whose motion runs on the GPU
    instancing.tsx           InstanceSet and InstancedPart
```

## One layout feeds everything

`buildCropLayout({ width, length, gutterHeight, crop, irrigation, quality })` returns the bed positions, every plant slot, the height scale and the trellis wire height. The crop models and the irrigation models both read it, so a drip tape always lies beside the plants it waters and a sprinkler always stands in a walkway. It is deterministic: the same setup gives the same field.

- Soil beds are 0.9 m wide with 0.75 m walkways. Hydroponic mode puts three channels on each raised table instead.
- Tall crops shrink to fit under a low gutter (never below 40%).
- Plant counts are capped by quality: 320 on high, 200 on balanced, 100 on lite.

## Crops

Every plant is assembled from shared parts and drawn as one instanced mesh per part, so a field costs a handful of draw calls.

| Crop | What is modelled |
|---|---|
| Tomato | vine on a string from an overhead wire, leaves up the stem, three trusses ripening from red at the bottom to green at the top |
| Capsicum | forked bush, glossy leaves, blocky peppers in red, yellow, orange and green |
| Cucumber | tall vine on a string, broad flat leaves, long fruit hanging low |
| Lettuce | rosette of three rings of ruffled leaves, about one head in five red |
| Strawberry | trifoliate leaves, berries on black plastic mulch, white flowers |
| Gerbera | rosette of long leaves, tall stalks topped by daisies in seven colours |

Leaf sway runs in the vertex shader (more lean the higher the vertex), so it costs no CPU.

## Irrigation

| System | What is modelled |
|---|---|
| Drip | blue tape on each bed, green emitters, drops falling onto the soil |
| Sprinkler | risers in the walkways, heads that throw slowly turning arcs of water |
| Fogger | overhead line with misting nozzles, translucent plumes and drifting mist |
| Hydroponic (NFT) | raised tables of open channels with water flowing along them, net pots, a return gutter and pipe back to the reservoir |

Every system has a pump house outside the back wall (tank, pump, filter, plus a fertigation barrel for drip, a pressure vessel for fogging and dosing bottles for hydroponics). Water motion is shader-driven: `fall`, `spray`, `mist` and `flow` modes in `sceneMaterials.ts`.

## Camera shortcuts

`1` overview, `2` front, `3` side, `4` top, `5` inside, `6` door, `7` vents, `8` irrigation, `9` climate equipment. The irrigation view looks along the beds toward the supply header; the vents view looks at the end of the side vent where the crank or motor is.

## Testing hooks

In development and test builds (not production), `window.__greenhouseScene` is the Three.js scene. The canvas wrapper carries `data-testid="scene-canvas"` plus `data-build-stage`, `data-quality`, `data-crop` and `data-irrigation`, and an `aria-label` that describes the model for screen readers.

Named objects the tests look for: `greenhouse-model` (its `userData` records every option), `crop-<id>`, `irrigation-<id>`, `pump-house-<id>`, `growing-beds`, `roof-cover`, `side-wall-cover`, `end-wall-cover`, `shade-net-structure`, `vents-<type>`, `door-<type>`, `climate-equipment`, and instanced parts named `<crop>-<part>` or `<system>-<part>`.

- `src/test/crop-scene.test.ts` checks the layout rules and the geometry of every crop and system without a browser.
- `e2e/scene-options.spec.ts` opens every option through a share link, inspects what was built, checks for console errors, compares screenshots so no two options look alike, and writes screenshots to `test-results/scene/`.
- `e2e/scene.spec.ts` guards against the WebGL buffer-resize error.

## Adding a crop or an irrigation system

1. Crop: add an entry to `CROP_SPECS` (spacing, lines, height), a builder in `cropParts.ts`, and add the id to `CropType` and `VALID_CROPS` on the backend. Add its parts to `CROP_PARTS` in the e2e spec.
2. Irrigation: add a block in `irrigationParts.ts` and a pump-house variant in `IrrigationSystem.tsx`.
3. Run `npx vitest run src/test/crop-scene.test.ts` and `npx playwright test e2e/scene-options.spec.ts`, then look at the screenshots.

## Known limits

- Hydroponic channels are modelled flat, without the real 1 to 2 percent slope.
- Plants are placed on a regular grid with small jitter; real fields are less even.
- The building shell (frame, cover, doors, louvres) is still built in `GreenhouseModel.tsx` from simple shapes. Only the fan and cooling pad (`exhaust-fan-cooling-pad.glb`) and the sliding door (`single-sliding-door.glb`) still load a pre-made model; `rollup-vent.glb` is no longer used.
