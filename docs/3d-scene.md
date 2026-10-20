# The 3D scene

How the shed visualizer builds what you see, and how it is tested. What real Indian sheds look like, and the sizes the
model uses, are in [3d-model-references.md](3d-model-references.md).

## Where things live

```
src/components/farm/
  FarmModel.tsx              the whole shed, built in stages; dimension guides and focus markers
  MiddlePanel.tsx            canvas, selection, grips, G and S, camera shortcuts, quality level, accessible description
  CameraController.tsx       the camera presets (keys 1 to 9) and framing a part
  PropertiesPanel.tsx        the parts and their options over the model on a phone
  scene/
    shedLayout.ts            where everything goes (pure, unit-tested): bays, roof planes, entry, cages, feeding, birds
    ShedStructure.tsx        plinth, frame, roof sheets, walls, entry, tunnel pads and fans
    ShedInterior.tsx         litter or cage floor, the flock, A-type cages, feeding fittings, silo, brooders, water tank
    shedMaterials.ts         frame and sheet looks, wire mesh, curtains, plaster, litter and pad textures
    EditHandles.tsx          the grips of the selected part
    SelectionOutline.tsx     the outline of the selected and hovered parts
    partBounds.ts            the box around a part, for its outline and for framing it
    instancing.tsx           InstanceSet and InstancedPart
    transitions.tsx          build-in, cross-fade and size easing
src/lib/sceneEdit.ts         the editable parts, their options, locks, grips and snapping
```

## One layout feeds everything

`buildShedLayout({ length, width, eavesHeight, ridgeHeight, roofType })` returns the truss lines (a bay about every 3 m),
the roof planes with the 1.07 m overhang, the line the roof follows over the walls (the end-wall gable and the truss
top), how high each side wall reaches, and for a monitor roof its open band and cap lift. Every post, sheet, wall and
fitting is drawn from it, so they always line up.

`buildInteriorLayout({ length, width, birdType, feedingSystem, cageTiers, birds, quality })` returns the cage rows and
tiers, the feeders, drinkers, pan and nipple lines, troughs, hoppers, silo and brooders, and every bird drawn. It is
deterministic (a seeded generator), so the same setup always gives the same flock.

- The flock is the planner's own count (`flockSize`, the same as the server). At most 1,200 birds are drawn on high,
  600 on balanced and 200 on lite; the model's `userData` records both `birdsTotal` and `birdsShown`.
- Feeders, drinkers, pans and nipples are capped at 900, 500 and 160 of each kind; past the cap the spacing widens.

## The parts

| Part (sidebar tab) | What is modelled | Named objects |
|---|---|---|
| Size | the whole shed: grips for length, width, corner, eaves and ridge | `farm-model` |
| Shed type | open sides, closed tunnel walls with pads and fans, or a backyard shed with a fenced run | `walls-*`, `tunnel-*` |
| Roof | gable, monitor (raised cap over a meshed opening) or lean-to; ridge cap | `roof-model`, `roof-ridge`, `roof-vent` |
| Frame | steel trusses on steel posts, steel trusses on RCC pillars with a ring beam, or bamboo rafters | `frame-posts`, `frame-members` |
| Roof sheet | GI, galvalume, fibre cement, PUF panel or thatch, with corrugation as colour and bump | `roof-sheet` |
| Side walls | low plastered wall, welded mesh, yellow tarpaulin curtains let down part way; winch and cables when automatic | `walls-low`, `walls-mesh`, `walls-curtains`, `walls-winch`, `walls-solid` |
| Entry | door, door with a disinfectant footbath, or an anteroom with its own roof and outer door | `entry-door`, `entry-footbath`, `entry-anteroom` |
| Birds | low-poly hens in the breed's colours on litter, or A-type cages of 2 to 4 tiers | `birds-bodies`, `birds-details`, `litter`, `cages-*` |
| Feeding | round feeders and bell drinkers; pan and nipple lines; auger lines with hoppers and a silo; cage troughs | `feeding-*` |

Group names start with their part, and `partForObjectName` in `src/lib/sceneEdit.ts` maps a click to the part, which
opens the sidebar tab of the same name. Unnamed or `site-*` objects (the plinth, the water tank) select the shed.

## Build stages

1 plinth and floor, 2 frame, 3 roof, 4 walls and entry, 5 cages, feeding and tunnel equipment, 6 birds. Each stage
animates in; changing an option cross-fades the part it changes; resizing eases the whole model.

## Camera shortcuts

`1` overview, `2` front, `3` side, `4` top, `5` inside, `6` entry, `7` side walls (open sheds), `8` feeding,
`9` tunnel fans (controlled sheds). A shed shorter than 6 m is seen corner to corner from inside, so the camera stays
at least 2 m from what it looks at.

## Testing hooks

In development and test builds (not production), `window.__farmScene` is the Three.js scene and `window.__farmEditor`
selects parts and reads the grips. The canvas wrapper carries `data-testid="scene-canvas"` plus `data-build-stage`,
`data-quality`, `data-bird`, `data-feeding`, `data-selected` and `data-mode`, and an `aria-label` that describes the
shed for screen readers.

- `src/test/bird-scene.test.ts` checks the layout rules without a browser: bays, roof planes, monitor and lean-to, the
  entry, fans, the bird cap, cages, feeding and the fitting caps.
- `src/test/scene-edit.test.ts` checks the parts, options, locks, grips and snapping.
- `e2e/scene-options.spec.ts` (tagged `@scene`) opens every option through a share link, inspects what was built,
  checks for console errors, compares screenshots so no two options look alike, and writes screenshots to
  `test-results/scene/`.
- `e2e/editor.spec.ts` covers selecting, dragging, G and S, and the sidebar following the selection.
- `e2e/scene.spec.ts` guards against the WebGL buffer-resize error.

## Known limits

- Curtains are drawn at one position (40% of the opening); the model does not animate them.
- Birds stand on a jittered grid; real flocks bunch at feeders and drinkers and away from the walls in heat.
- Cages are drawn as translucent boxes with cell dividers, not individual wires.
- The feed store, generator shed and lighting are not drawn; the generator is a plain box beside a controlled shed.
