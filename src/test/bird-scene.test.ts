import { describe, expect, it } from 'vitest';
import {
  BIRD_CAP,
  CAGE,
  FITTING_CAP,
  OVERHANG,
  anteroom,
  buildInteriorLayout,
  buildShedLayout,
  entryDepth,
  roofHeightAt,
  type InteriorInput,
  type RenderQuality,
} from '@/components/farm/scene/shedLayout';
import { tunnelFans } from '@/components/farm/scene/ShedStructure';
import { flockSize } from '@/lib/flock';
import { DEFAULT_CONFIG } from '@/types/farm';

const QUALITIES: RenderQuality[] = ['high', 'balanced', 'lite'];
const shape = { length: 14, width: 7, eavesHeight: 2.1, ridgeHeight: 3.5, roofType: 'gable' as const };
const interior = (patch: Partial<InteriorInput> = {}) =>
  buildInteriorLayout({ length: 14, width: 7, birdType: 'broiler', feedingSystem: 'manual', cageTiers: 3, birds: 1054, quality: 'high', ...patch });

describe('the shed layout', () => {
  it('puts a truss about every 3 m, both end walls included', () => {
    const layout = buildShedLayout(shape);
    expect(layout.bays).toBe(5);
    expect(layout.frameZ).toHaveLength(6);
    expect(layout.frameZ[0]).toBeCloseTo(-7, 9);
    expect(layout.frameZ[5]).toBeCloseTo(7, 9);
    expect(layout.bayLength).toBeCloseTo(2.8, 9);
    expect(buildShedLayout({ ...shape, length: 2 }).bays).toBe(1);
  });

  it('runs a gable roof from the eaves up to the ridge, with the overhang past both walls', () => {
    const layout = buildShedLayout(shape);
    expect(layout.planes).toHaveLength(2);
    expect(layout.planes[0].a[0]).toBeCloseTo(-3.5 - OVERHANG, 9);
    expect(layout.planes[1].b[0]).toBeCloseTo(3.5 + OVERHANG, 9);
    expect(layout.planes[0].b).toEqual([0, 3.5]);
    // The overhang keeps the slope, so its edge hangs below the eaves.
    expect(layout.planes[0].a[1]).toBeLessThan(2.1);
    expect(roofHeightAt(shape, -3.5)).toBeCloseTo(2.1, 9);
    expect(roofHeightAt(shape, 0)).toBeCloseTo(3.5, 9);
    expect(layout.wallTop).toEqual({ left: 2.1, right: 2.1 });
  });

  it('raises a lean-to roof from the left wall to the right one', () => {
    const layout = buildShedLayout({ ...shape, roofType: 'lean-to' });
    expect(layout.planes).toHaveLength(1);
    expect(layout.wallTop).toEqual({ left: 2.1, right: 3.5 });
    expect(layout.monitor).toBeNull();
  });

  it('lifts a monitor cap over an open band at the ridge', () => {
    const layout = buildShedLayout({ ...shape, roofType: 'monitor' });
    expect(layout.planes).toHaveLength(4);
    const monitor = layout.monitor!;
    expect(monitor.lift).toBeGreaterThanOrEqual(0.25);
    expect(monitor.lift).toBeLessThanOrEqual(0.5);
    // The cap meets at the ridge; the lower roof stops at the band, a lift below the cap.
    expect(Math.max(...layout.planes.flatMap((plane) => [plane.a[1], plane.b[1]]))).toBeCloseTo(3.5, 9);
    expect(roofHeightAt({ ...shape, roofType: 'monitor' }, 0)).toBeCloseTo(3.5 - monitor.lift, 9);
    for (const plane of layout.planes.slice(0, 2)) expect(Math.abs(plane.b[0]) === monitor.halfWidth || Math.abs(plane.a[0]) === monitor.halfWidth).toBe(true);
  });

  it('builds the entry out from the end wall', () => {
    expect(anteroom('single-door', 2.1)).toBeNull();
    expect(anteroom('anteroom', 2.1)!.height).toBeLessThanOrEqual(2.4);
    expect(entryDepth('single-door')).toBe(0);
    expect(entryDepth('anteroom')).toBeGreaterThan(entryDepth('door-footbath'));
  });

  it('fits the tunnel fans across the back wall', () => {
    const fans = tunnelFans({ halfWidth: 6, eavesHeight: 3 });
    expect(fans.xs.length).toBeGreaterThanOrEqual(7);
    expect(fans.size).toBeLessThanOrEqual(1.38);
    for (const x of fans.xs) expect(Math.abs(x) + fans.size / 2).toBeLessThanOrEqual(6 + 1e-9);
    expect(tunnelFans({ halfWidth: 1, eavesHeight: 1.5 }).xs).toHaveLength(1);
  });
});

describe('the flock', () => {
  it('draws the whole flock up to the cap for the quality, and says how many it holds', () => {
    for (const quality of QUALITIES) {
      const small = interior({ quality });
      expect(small.birdsTotal).toBe(1054);
      expect(small.birdsShown).toBe(Math.min(1054, BIRD_CAP[quality]));
      const big = interior({ length: 100, width: 12, birds: 12_900, quality });
      expect(big.birdsShown).toBe(BIRD_CAP[quality]);
      expect(big.birdsTotal).toBe(12_900);
    }
    expect(interior({ birds: 0 }).birds).toHaveLength(0);
  });

  it('keeps every floor bird on the litter inside the walls, the same way every time', () => {
    const layout = interior();
    for (const bird of layout.birds) {
      expect(Math.abs(bird.position[0])).toBeLessThan(3.5);
      expect(Math.abs(bird.position[2])).toBeLessThan(7);
      expect(bird.position[1]).toBe(0);
    }
    expect(interior().birds).toEqual(layout.birds);
  });

  it('colours each breed: white broilers, brown floor layers, mixed desi birds', () => {
    const colours = (birdType: InteriorInput['birdType']) => new Set(interior({ birdType }).birds.map((bird) => bird.color));
    expect([...colours('broiler')].every((colour) => colour.startsWith('#f') || colour.startsWith('#e'))).toBe(true);
    expect(colours('desi').size).toBeGreaterThan(colours('broiler').size);
    expect([...colours('layer-floor')].some((colour) => colour.startsWith('#9') || colour.startsWith('#a'))).toBe(true);
  });

  it('holds the flock the planner counts for the recommended shed', () => {
    const birds = flockSize({ ...DEFAULT_CONFIG, housing: DEFAULT_CONFIG.housingSystem })!;
    expect(interior({ birds }).birdsTotal).toBe(birds);
  });
});

describe('layer cages', () => {
  it('builds A-type rows with the chosen tiers, stepped out towards the floor', () => {
    for (const cageTiers of [2, 3, 4]) {
      const layout = interior({ birdType: 'layer-cage', feedingSystem: 'trough', cageTiers });
      expect(layout.mode).toBe('cage');
      expect(layout.cageRows.length).toBeGreaterThanOrEqual(1);
      for (const row of layout.cageRows) {
        expect(row.tiers).toHaveLength(cageTiers);
        // Each tier sits higher and further in than the one below.
        for (let i = 1; i < row.tiers.length; i += 1) {
          expect(row.tiers[i].y).toBeGreaterThan(row.tiers[i - 1].y);
          expect(row.tiers[i].outer).toBeLessThan(row.tiers[i - 1].outer);
        }
        expect(Math.abs(row.x) + row.halfWidth).toBeLessThanOrEqual(3.5);
      }
      expect(layout.troughs).toHaveLength(layout.cageRows.length * 2 * cageTiers);
    }
  });

  it('puts two rows in a 7 m shed and every bird on a cage floor', () => {
    const layout = interior({ birdType: 'layer-cage', feedingSystem: 'trough' });
    expect(layout.cageRows).toHaveLength(2);
    const floors = layout.cageRows[0].tiers.map((tier) => tier.y + 0.02);
    for (const bird of layout.birds) expect(floors.some((y) => Math.abs(y - bird.position[1]) < 1e-9)).toBe(true);
    expect(layout.birdsShown).toBeLessThanOrEqual(BIRD_CAP.high);
    expect(CAGE.depth).toBeGreaterThan(0);
  });
});

describe('feeding', () => {
  it('sets out round feeders and bell drinkers for manual feeding', () => {
    const layout = interior({ feedingSystem: 'manual' });
    expect(layout.feeders.length).toBeGreaterThan(0);
    expect(layout.drinkers.length).toBeGreaterThan(0);
    expect(layout.panLines).toHaveLength(0);
    expect(interior({ length: 2, width: 2 }).drinkers.length).toBeGreaterThan(0);
  });

  it('lays pan and nipple lines down the shed, with hoppers and a silo when automatic', () => {
    const semi = interior({ feedingSystem: 'semi-auto' });
    expect(semi.panLines.length).toBeGreaterThan(0);
    expect(semi.nippleLines.length).toBeGreaterThan(0);
    expect(semi.hoppers).toHaveLength(0);
    expect(semi.silo).toBeNull();
    const auto = interior({ feedingSystem: 'automatic' });
    expect(auto.hoppers).toHaveLength(auto.panLines.length);
    expect(auto.silo).not.toBeNull();
    expect(auto.panLines.every((line) => line.y > 0)).toBe(true);
  });

  it('gives cages troughs and nipple lines, and a feed trolley per row when automatic', () => {
    const trough = interior({ birdType: 'layer-cage', feedingSystem: 'trough' });
    expect(trough.nippleLines).toHaveLength(trough.troughs.length);
    expect(trough.silo).toBeNull();
    const auto = interior({ birdType: 'layer-cage', feedingSystem: 'automatic' });
    expect(auto.hoppers).toHaveLength(auto.cageRows.length);
    expect(auto.silo).not.toBeNull();
  });

  it('caps the fittings drawn in a long shed', () => {
    for (const quality of QUALITIES) {
      const layout = interior({ length: 150, width: 18, birds: 20_000, feedingSystem: 'automatic', quality });
      expect(layout.pans.length).toBeLessThanOrEqual(FITTING_CAP[quality]);
      expect(layout.nipples.length).toBeLessThanOrEqual(FITTING_CAP[quality]);
      const manual = interior({ length: 150, width: 18, birds: 20_000, quality });
      expect(manual.feeders.length + manual.drinkers.length).toBeLessThanOrEqual(FITTING_CAP[quality]);
    }
  });

  it('adds brooders for a meat flock only', () => {
    expect(interior().brooders.length).toBeGreaterThan(0);
    expect(interior({ birdType: 'layer-floor' }).brooders).toHaveLength(0);
  });
});
