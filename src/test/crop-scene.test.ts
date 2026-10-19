import { describe, expect, it } from 'vitest';
import type { CropType, IrrigationSystem } from '@/types/farm';
import { BED_WIDTH, CROP_SPECS, NFT_LINES, buildCropLayout, plantCap, type RenderQuality } from '@/components/farm/scene/cropLayout';
import { buildCropParts } from '@/components/farm/scene/cropParts';
import { aisleX, buildIrrigationParts } from '@/components/farm/scene/irrigationParts';

const CROPS = Object.keys(CROP_SPECS) as CropType[];
const IRRIGATION: IrrigationSystem[] = ['drip', 'sprinkler', 'fogger', 'hydroponic-nft'];
const QUALITIES: RenderQuality[] = ['high', 'balanced', 'lite'];
const HOUSES = [
  { length: 30, width: 10, gutterHeight: 4 },
  { length: 5, width: 5, gutterHeight: 2 }, // smallest allowed
  { length: 200, width: 100, gutterHeight: 8 }, // largest allowed
  { length: 60, width: 7, gutterHeight: 3 },
];

describe('crop layout', () => {
  it('keeps every plant on its bed, inside the house, and under the plant cap', () => {
    for (const house of HOUSES) {
      for (const crop of CROPS) {
        for (const irrigation of IRRIGATION) {
          for (const quality of QUALITIES) {
            const label = `${crop}/${irrigation}/${quality} in ${house.length}x${house.width}`;
            const layout = buildCropLayout({ ...house, crop, irrigation, quality });
            expect(layout.plants.length, `${label}: has plants`).toBeGreaterThan(0);
            // The cap is on plants per line, so staggering and the 3-plant minimum can overshoot slightly.
            expect(layout.plants.length, `${label}: cap`).toBeLessThanOrEqual(plantCap(CROP_SPECS[crop], quality) + layout.rowCount * layout.lineOffsets.length * 3);
            expect(layout.rowCount, `${label}: rows`).toBeLessThanOrEqual(10);
            // One assertion per layout (not per plant) keeps this exhaustive check fast.
            const misplaced = layout.plants.filter(
              (plant) =>
                Math.abs(plant.x - layout.rowX[plant.row]) > BED_WIDTH / 2 ||
                Math.abs(plant.x) >= house.width / 2 ||
                plant.z < layout.zMin - 0.1 ||
                plant.z > layout.zMax + 0.1
            );
            expect(misplaced, `${label}: plants off their bed or outside the house`).toEqual([]);
          }
        }
      }
    }
  }, 60_000);

  it('puts plants in soil beds, or in three channels per table for hydroponics', () => {
    const soil = buildCropLayout({ ...HOUSES[0], crop: 'tomato', irrigation: 'drip', quality: 'high' });
    const nft = buildCropLayout({ ...HOUSES[0], crop: 'lettuce', irrigation: 'hydroponic-nft', quality: 'high' });
    expect(soil.mode).toBe('soil');
    expect(soil.baseY).toBeCloseTo(0.28);
    expect(nft.mode).toBe('nft');
    expect(nft.lineOffsets).toHaveLength(NFT_LINES);
    expect(nft.baseY).toBeGreaterThan(0.85); // on top of the table
  });

  it('shrinks tall crops to fit under a low gutter and never grows them', () => {
    const low = buildCropLayout({ length: 30, width: 10, gutterHeight: 2, crop: 'cucumber', irrigation: 'drip', quality: 'high' });
    const tall = buildCropLayout({ length: 30, width: 10, gutterHeight: 8, crop: 'cucumber', irrigation: 'drip', quality: 'high' });
    expect(low.heightScale).toBeLessThan(1);
    expect(low.heightScale).toBeGreaterThanOrEqual(0.4);
    expect(tall.heightScale).toBe(1);
    expect(low.wireY).toBeLessThan(2);
  });

  it('is deterministic', () => {
    const input = { ...HOUSES[0], crop: 'strawberry' as const, irrigation: 'drip' as const, quality: 'balanced' as const };
    expect(buildCropLayout(input)).toEqual(buildCropLayout(input));
  });

  it('keeps plants apart so they never overlap', () => {
    for (const crop of CROPS) {
      const layout = buildCropLayout({ ...HOUSES[0], crop, irrigation: 'drip', quality: 'high' });
      let nearest = Infinity;
      const sample = layout.plants.slice(0, 120);
      for (let i = 0; i < sample.length; i += 1) {
        for (let j = i + 1; j < sample.length; j += 1) {
          nearest = Math.min(nearest, Math.hypot(sample[i].x - sample[j].x, sample[i].z - sample[j].z));
        }
      }
      expect(nearest, `${crop}: closest pair`).toBeGreaterThan(0.1);
    }
  }, 30_000);
});

describe('crop models', () => {
  const EXPECTED: Record<CropType, string[]> = {
    tomato: ['stems', 'strings', 'leaves', 'fruit', 'wires', 'posts', 'hooks'],
    capsicum: ['stems', 'leaves', 'fruit', 'stakes'],
    cucumber: ['stems', 'strings', 'leaves', 'fruit', 'wires', 'posts', 'hooks'],
    lettuce: ['leaves'],
    strawberry: ['leaves', 'fruit', 'flowers', 'trusses'],
    gerbera: ['leaves', 'stalks', 'petals', 'centres'],
  };

  it('builds the parts each crop is made of, with consistent buffers', () => {
    for (const crop of CROPS) {
      for (const quality of QUALITIES) {
        const layout = buildCropLayout({ ...HOUSES[0], crop, irrigation: 'drip', quality });
        const built = buildCropParts(layout, quality);
        const names = built.parts.map((part) => part.name);
        expect(names.sort(), `${crop}/${quality}`).toEqual(EXPECTED[crop].map((part) => `${crop}-${part}`).sort());
        for (const part of built.parts) {
          // Strawberry flowers and trusses are details dropped on the lowest quality level.
          const optional = (part.name === 'strawberry-flowers' || part.name === 'strawberry-trusses') && quality === 'lite';
          if (!optional) expect(part.set.count, `${part.name} has instances`).toBeGreaterThan(0);
          expect(part.set.matrices.length, `${part.name} matrices`).toBe(part.set.count * 16);
          expect(part.set.colors.length, `${part.name} colours`).toBe(part.set.count * 3);
          expect(part.set.matrices.every(Number.isFinite), `${part.name}: finite matrices`).toBe(true);
        }
        built.dispose();
      }
    }
  }, 60_000);

  it('gives only trellised crops a wire and posts, one wire per row', () => {
    for (const crop of CROPS) {
      const layout = buildCropLayout({ ...HOUSES[0], crop, irrigation: 'drip', quality: 'high' });
      const built = buildCropParts(layout, 'high');
      const wires = built.parts.find((part) => part.name === `${crop}-wires`);
      if (CROP_SPECS[crop].trellis) expect(wires?.set.count).toBe(layout.rowCount);
      else expect(wires).toBeUndefined();
      built.dispose();
    }
  });

  it('draws more detail on high than on lite', () => {
    const count = (quality: RenderQuality) => {
      const layout = buildCropLayout({ ...HOUSES[0], crop: 'tomato', irrigation: 'drip', quality });
      const built = buildCropParts(layout, quality);
      const total = built.parts.reduce((sum, part) => sum + part.set.count, 0);
      built.dispose();
      return total;
    };
    expect(count('high')).toBeGreaterThan(count('lite'));
  });
});

describe('irrigation models', () => {
  const EXPECTED: Record<IrrigationSystem, string[]> = {
    drip: ['pipes', 'emitters', 'drops'],
    sprinkler: ['pipes', 'heads', 'spray'],
    fogger: ['pipes', 'nozzles', 'plumes', 'mist'],
    'hydroponic-nft': ['pipes', 'legs', 'channel-floors', 'channel-walls', 'water'],
  };

  it('builds the parts each system is made of', () => {
    for (const house of HOUSES) {
      for (const system of IRRIGATION) {
        for (const quality of QUALITIES) {
          const layout = buildCropLayout({ ...house, crop: 'tomato', irrigation: system, quality });
          const built = buildIrrigationParts(system, {
            layout,
            halfWidth: house.width / 2,
            halfLength: house.length / 2,
            gutterHeight: house.gutterHeight,
            quality,
          });
          const label = `${system}/${quality} in ${house.length}x${house.width}`;
          expect(built.parts.map((part) => part.name).sort(), label).toEqual(EXPECTED[system].map((part) => `${system}-${part}`).sort());
          for (const part of built.parts) {
            expect(part.set.count, `${label}: ${part.name}`).toBeGreaterThan(0);
            expect(part.set.matrices.every(Number.isFinite), `${label}: ${part.name} finite`).toBe(true);
          }
          built.dispose();
        }
      }
    }
  }, 60_000);

  it('keeps the pump house outside the back wall and every part within sensible limits', () => {
    const house = HOUSES[0];
    const layout = buildCropLayout({ ...house, crop: 'tomato', irrigation: 'drip', quality: 'high' });
    const built = buildIrrigationParts('drip', { layout, halfWidth: 5, halfLength: 15, gutterHeight: 4, quality: 'high' });
    expect(built.head.z).toBeLessThan(-15);
    const total = built.parts.reduce((sum, part) => sum + part.set.count, 0);
    expect(total).toBeLessThan(5000); // a draw-call and memory budget, not a style choice
  });

  it('places sprinklers and foggers in the walkways and keeps their count bounded on huge houses', () => {
    const house = HOUSES[2];
    for (const system of ['sprinkler', 'fogger'] as const) {
      const layout = buildCropLayout({ ...house, crop: 'tomato', irrigation: system, quality: 'high' });
      const aisles = aisleX(layout);
      expect(aisles.length).toBe(layout.rowCount - 1);
      for (const x of aisles) {
        for (const rowX of layout.rowX) expect(Math.abs(x - rowX)).toBeGreaterThan(BED_WIDTH / 2 - 1e-6);
      }
      const built = buildIrrigationParts(system, { layout, halfWidth: 100, halfLength: 50, gutterHeight: 8, quality: 'high' });
      expect(built.parts.reduce((sum, part) => sum + part.set.count, 0)).toBeLessThan(6000);
      built.dispose();
    }
  });

  it('draws hydroponic channels along every table line with water in each', () => {
    const layout = buildCropLayout({ ...HOUSES[0], crop: 'lettuce', irrigation: 'hydroponic-nft', quality: 'high' });
    const built = buildIrrigationParts('hydroponic-nft', { layout, halfWidth: 5, halfLength: 15, gutterHeight: 4, quality: 'high' });
    const channels = layout.rowCount * NFT_LINES;
    expect(built.parts.find((p) => p.name === 'hydroponic-nft-channel-floors')?.set.count).toBe(channels);
    expect(built.parts.find((p) => p.name === 'hydroponic-nft-water')?.set.count).toBe(channels);
    expect(built.parts.find((p) => p.name === 'hydroponic-nft-channel-walls')?.set.count).toBe(channels * 2);
    built.dispose();
  });
});

/** Radius of each instance of a unit cylinder: the length of its local x axis. */
const radii = (set: { matrices: number[]; count: number }) =>
  Array.from({ length: set.count }, (_, i) => Math.hypot(set.matrices[i * 16], set.matrices[i * 16 + 1], set.matrices[i * 16 + 2]));

describe('scene realism', () => {
  it('draws drip laterals in black LLDPE, not blue', () => {
    const layout = buildCropLayout({ ...HOUSES[0], crop: 'tomato', irrigation: 'drip', quality: 'high' });
    const built = buildIrrigationParts('drip', { layout, halfWidth: 5, halfLength: 15, gutterHeight: 4, quality: 'high' });
    const pipes = built.parts.find((part) => part.name === 'drip-pipes')!.set;
    const colours = Array.from({ length: pipes.count }, (_, i) => pipes.colors.slice(i * 3, i * 3 + 3));
    // Two laterals (and their risers) per bed are near black; nothing is saturated blue.
    expect(colours.filter(([r, g, b]) => r + g + b < 0.1).length).toBe(layout.rowCount * 4);
    expect(colours.filter(([r, g, b]) => b > r + 0.3 && b > g + 0.2)).toEqual([]);
    built.dispose();
  });

  it('keeps thin pipes, strings and wires at least a visible line wide on lite', () => {
    for (const system of IRRIGATION) {
      const layout = buildCropLayout({ ...HOUSES[0], crop: 'tomato', irrigation: system, quality: 'lite' });
      const built = buildIrrigationParts(system, { layout, halfWidth: 5, halfLength: 15, gutterHeight: 4, quality: 'lite' });
      for (const part of built.parts.filter((p) => /-(pipes|legs)$/.test(p.name))) {
        expect(Math.min(...radii(part.set)), part.name).toBeGreaterThanOrEqual(0.008 - 1e-6);
      }
      built.dispose();
    }
    for (const crop of ['tomato', 'cucumber', 'strawberry', 'gerbera'] as const) {
      const layout = buildCropLayout({ ...HOUSES[0], crop, irrigation: 'drip', quality: 'lite' });
      const built = buildCropParts(layout, 'lite');
      for (const part of built.parts.filter((p) => /-(strings|wires|trusses|stalks)$/.test(p.name) && p.set.count > 0)) {
        expect(Math.min(...radii(part.set)), part.name).toBeGreaterThanOrEqual(0.008 - 1e-6);
      }
      built.dispose();
    }
  });

  it('grows strawberries about 25 cm tall with ripe fruit hanging over the bed edge', () => {
    const layout = buildCropLayout({ ...HOUSES[0], crop: 'strawberry', irrigation: 'drip', quality: 'high' });
    const built = buildCropParts(layout, 'high');
    const position = (set: { matrices: number[] }, i: number) => [set.matrices[i * 16 + 12], set.matrices[i * 16 + 13], set.matrices[i * 16 + 14]];
    const leaves = built.parts.find((part) => part.name === 'strawberry-leaves')!.set;
    const tops = Array.from({ length: leaves.count }, (_, i) => position(leaves, i)[1] - layout.baseY);
    expect(Math.max(...tops)).toBeGreaterThan(0.12);
    expect(Math.max(...tops)).toBeLessThan(0.3);
    const fruit = built.parts.find((part) => part.name === 'strawberry-fruit')!.set;
    const overEdge = Array.from({ length: fruit.count }, (_, i) => position(fruit, i)).filter(([x, y]) => {
      const bed = layout.rowX.reduce((best, rx) => (Math.abs(rx - x) < Math.abs(best - x) ? rx : best), layout.rowX[0]);
      return Math.abs(x - bed) > BED_WIDTH / 2 && y < layout.baseY;
    });
    expect(overEdge.length).toBeGreaterThan(layout.plants.length / 2);
    built.dispose();
  });
});
