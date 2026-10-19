import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, SKIES, sceneReach } from '@/lib/sceneEnvironment';
import type { RenderQuality } from '@/components/greenhouse/scene/cropLayout';
import {
  buildBackdropPlan,
  CAMERA_FAR,
  GROUND_Y,
  groundHeight,
  houseClearance,
  inViewCorridor,
  HOUSE_MARGIN,
  LANDSCAPE_LOOKS,
  sceneFog,
  SKY_LOOKS,
} from '@/components/greenhouse/scene/environmentLooks';
import { farShape, groundShape, treeShapes } from '@/components/greenhouse/scene/environmentGeometry';

const QUALITIES: RenderQuality[] = ['high', 'balanced', 'lite'];
const HOUSES = [
  { length: 5, width: 5 }, // smallest allowed
  { length: 30, width: 10 },
  { length: 60, width: 7 },
  { length: 120, width: 60 },
  { length: 200, width: 100 }, // largest allowed
];
const HEX = /^#[0-9a-f]{6}$/i;

describe('landscape and sky tables', () => {
  it('describe every landscape and every sky completely', () => {
    expect(Object.keys(LANDSCAPE_LOOKS).sort()).toEqual([...ENVIRONMENTS].sort());
    expect(Object.keys(SKY_LOOKS).sort()).toEqual([...SKIES].sort());
    for (const id of ENVIRONMENTS) {
      const look = LANDSCAPE_LOOKS[id];
      for (const color of [look.ground, look.groundAlt, look.groundPatch, look.haze, ...look.grass]) expect(color, id).toMatch(HEX);
      expect(look.trees.length, `${id}: trees`).toBeGreaterThan(0);
      expect(look.far.length, `${id}: far scenery`).toBeGreaterThan(0);
      for (const mix of [...look.trees, ...look.far]) for (const color of mix.colors) expect(color, `${id}/${mix.kind}`).toMatch(HEX);
    }
    for (const id of SKIES) {
      const look = SKY_LOOKS[id];
      for (const color of [look.sun.color, look.fill.color, look.rim.color, look.hemisphere.sky, look.hemisphere.ground, look.fog, look.clouds.color, look.motes]) expect(color, id).toMatch(HEX);
      // The sun (or moon) is above the horizon, so the house is lit from above.
      expect(look.sun.direction[1], id).toBeGreaterThan(0);
    }
  });

  it('sets the mood: golden is low and warm, overcast has thick fog and no hard shadows, night is dark with stars', () => {
    expect(SKY_LOOKS.golden.sun.direction[1]).toBeLessThan(SKY_LOOKS.day.sun.direction[1] / 2);
    expect(SKY_LOOKS.overcast.shadows).toBe(false);
    expect(SKY_LOOKS.night.stars).toBe(true);
    const reach = sceneReach(30, 10);
    expect(sceneFog('plains', 'overcast', reach, 'high').far).toBeLessThan(sceneFog('plains', 'day', reach, 'high').far);
    expect(sceneFog('deccan', 'night', reach, 'high').color).not.toEqual(sceneFog('deccan', 'day', reach, 'high').color);
  });
});

describe('backdrop placement', () => {
  it('keeps every tree, field, hill and peak clear of the house and its margin, within the camera far plane', () => {
    for (const house of HOUSES) {
      const reach = sceneReach(house.length, house.width);
      for (const environment of ENVIRONMENTS) {
        for (const quality of QUALITIES) {
          const label = `${environment}/${quality} round ${house.length}x${house.width}`;
          const plan = buildBackdropPlan(environment, quality, reach, house.length, house.width);
          const all = [...plan.trees.flatMap((t) => t.items), ...plan.far.flatMap((f) => f.items), ...plan.fields, ...plan.teaRows, ...plan.terraces];
          const inside = all.filter(
            (item) => Math.abs(item.x) <= house.width / 2 + HOUSE_MARGIN + item.footprint && Math.abs(item.z) <= house.length / 2 + HOUSE_MARGIN + item.footprint
          );
          expect(inside, `${label}: on or next to the house`).toEqual([]);
          const tooFar = all.filter((item) => Math.hypot(item.x, item.z) + item.footprint + reach.maxDistance > CAMERA_FAR);
          expect(tooFar, `${label}: past the far plane`).toEqual([]);
          // Far scenery stands out on the horizon, inside the ground disc.
          for (const item of plan.far.flatMap((f) => f.items)) {
            const r = Math.hypot(item.x, item.z);
            expect(r, `${label}: far ring`).toBeGreaterThan(reach.fogFar * LANDSCAPE_LOOKS[environment].fogScale * 0.4);
            expect(r, `${label}: far ring`).toBeLessThan(plan.groundRadius);
          }
          expect(plan.trees.some((t) => t.items.length > 0), `${label}: has trees`).toBe(true);
          // No tree stands between the house and a preset camera view.
          const blocking = plan.trees.flatMap((t) => t.items).filter((item) => inViewCorridor(item.x, item.z, item.footprint, plan.clear, reach));
          expect(blocking, `${label}: trees in a camera's line of sight`).toEqual([]);
        }
      }
    }
  });

  it('draws fewer objects at lower quality and is the same every time', () => {
    const reach = sceneReach(30, 10);
    for (const environment of ENVIRONMENTS) {
      const count = (quality: RenderQuality) => buildBackdropPlan(environment, quality, reach, 30, 10).trees.reduce((n, t) => n + t.items.length, 0);
      expect(count('lite'), environment).toBeLessThan(count('balanced'));
      expect(count('balanced'), environment).toBeLessThan(count('high'));
      expect(buildBackdropPlan(environment, 'high', reach, 30, 10)).toEqual(buildBackdropPlan(environment, 'high', reach, 30, 10));
    }
  });

  it('keeps the ground flat under and round the house, below the foundation', () => {
    for (const house of HOUSES) {
      const clear = houseClearance(house.length, house.width);
      for (const environment of ENVIRONMENTS) {
        const look = LANDSCAPE_LOOKS[environment];
        for (const [x, z] of [[0, 0], [clear.hx, clear.hz], [-clear.hx, clear.hz], [clear.hx + 5, 0]]) {
          expect(groundHeight(look, x, z, clear.flat), `${environment} at ${x},${z}`).toBe(GROUND_Y);
        }
      }
    }
    expect(GROUND_Y).toBeLessThanOrEqual(-0.02);
  });
});

describe('landscape geometry', () => {
  it('builds low-poly shapes with colours for every tree and landform', () => {
    const kinds = new Set(ENVIRONMENTS.flatMap((id) => LANDSCAPE_LOOKS[id].trees.map((t) => t.kind)));
    for (const kind of kinds) {
      const { wood, leaves } = treeShapes(kind);
      for (const geometry of [wood, leaves]) {
        if (!geometry) continue;
        expect(geometry.getAttribute('color'), kind).toBeDefined();
        expect(geometry.getAttribute('position').count / 3, `${kind}: triangles`).toBeLessThan(800);
        geometry.dispose();
      }
    }
    const farKinds = new Set(ENVIRONMENTS.flatMap((id) => LANDSCAPE_LOOKS[id].far.map((f) => f.kind)));
    for (const kind of farKinds) {
      const geometry = farShape(kind);
      expect(geometry.getAttribute('position').count / 3, `${kind}: triangles`).toBeLessThan(400);
      geometry.dispose();
    }
    const ground = groundShape(LANDSCAPE_LOOKS.mountains, 60, 400, 'high');
    expect(ground.getAttribute('position').count).toBeLessThan(5000);
    ground.dispose();
  });
});
