/** @vitest-environment node */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { computeSchemeSubsidy, NHB_NORMS } = require('../../backend/data/subsidySchemes');

const tubular = (areaSqm: number, extra: object = {}) =>
  computeSchemeSubsidy({
    structureType: 'naturally-ventilated',
    structureMaterial: 'galvanized_iron',
    stateName: 'Maharashtra',
    areaSqm,
    eligibleCostInr: 10_000 * areaSqm, // well above every norm, so the norm decides
    ...extra,
  });

describe('MIDH 2025 state-mission norms (projects under 4,000 sq m)', () => {
  it.each([
    [300, 1200],
    [500, 1200],
    [501, 1050],
    [1008, 1050],
    [1009, 1000],
    [2500, 1000],
  ])('a %i sq m naturally ventilated tubular house is rated at Rs %i per sq m', (area, rate) => {
    const result = tubular(area);
    expect(result).toMatchObject({ scheme: 'NHM', normPerSqmInr: rate, eligibleAreaSqm: area, percent: 50 });
    expect(result.amountInr).toBe(Math.round(0.5 * rate * area));
  });

  it('applies the last published slab between 2,500 and 4,000 sq m and says so', () => {
    const result = tubular(3000);
    expect(result).toMatchObject({ scheme: 'NHM', normPerSqmInr: 1000, eligibleAreaSqm: 3000 });
    expect(result.notes.join(' ')).toMatch(/2,500 m2 slab rate/);
  });

  it('uses the fan and pad slabs for a climate-controlled house', () => {
    expect(tubular(400, { structureType: 'climate-controlled' }).normPerSqmInr).toBe(1800);
    expect(tubular(800, { structureType: 'climate-controlled' }).normPerSqmInr).toBe(1600);
    expect(tubular(2000, { structureType: 'climate-controlled' }).normPerSqmInr).toBe(1500);
  });

  it('rates NE and Himalayan states 15% higher', () => {
    expect(tubular(300, { stateName: 'Arunachal Pradesh' })).toMatchObject({ normPerSqmInr: 1380, specialArea: true });
  });

  it('supports the real cost when it is below the norm', () => {
    expect(tubular(300, { eligibleCostInr: 200_000 })).toMatchObject({ normCostInr: 360_000, eligibleCostInr: 200_000, amountInr: 100_000 });
  });

  it('notes the unit limit for bamboo structures', () => {
    expect(tubular(200, { structureMaterial: 'bamboo' }).notes.join(' ')).toMatch(/10 units/);
  });
});

describe('NHB (projects of 4,000 sq m and above)', () => {
  it('switches to the NHB scheme at exactly 4,000 sq m', () => {
    expect(tubular(3999).scheme).toBe('NHM');
    expect(tubular(4000)).toMatchObject({ scheme: 'NHB', normPerSqmInr: 844, amountInr: 0.5 * 844 * 4000 });
  });

  it('uses the hilly rate in a special-area state and limits the amount to Rs 56 lakh', () => {
    expect(tubular(5000, { stateName: 'Sikkim' }).normPerSqmInr).toBe(970);
    expect(tubular(20000)).toMatchObject({ amountInr: 5_600_000, cappedAtInr: 5_600_000 });
  });

  it('matches the NHB figures in the published dataset', () => {
    const csv = fs.readFileSync(path.join(__dirname, '../../datasets/csv/nhb_midh_protected_cultivation_cost_norms.csv'), 'utf8');
    const rows = csv.trim().split('\n').slice(1).map((line) => line.split(','));
    const expected: Record<string, string> = {
      fanAndPad: 'Fan & Pad system',
      naturallyVentilatedTubular: 'Naturally ventilated - Tubular structure',
      naturallyVentilatedBamboo: 'Naturally ventilated - Bamboo structure',
    };
    for (const [key, structure] of Object.entries(expected)) {
      const cells = rows.find((row) => row[2] === structure);
      expect(cells, structure).toBeDefined();
      expect(NHB_NORMS[key]).toEqual({ plain: Number(cells?.[3]), hilly: Number(cells?.[5]) });
    }
  });
});
