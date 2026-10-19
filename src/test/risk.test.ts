/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CULTIVABLE_AREA_SHARE } from '@/lib/finance';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const risk = require('../../backend/services/risk/monteCarlo');
const app = require('../../backend/app');

// The Goa benchmark: 300 sq m, Rs 4,95,338 build, MIDH 2025 norm Rs 3,60,000.
const project = {
  areaSqm: 300,
  capitalCostInr: 495338,
  subsidyOwnCostInr: 478013,
  scheme: { normCostInr: 360000, capInr: null },
  subsidyPct: 50,
  yieldPerSqm: 12,
  pricePerUnit: 25,
  operatingCostPct: 40,
  yieldRange: { low: 45.3, high: 83.9 },
  priceSigmaLog: 0.286,
  years: 10,
};

describe('Monte Carlo risk model', () => {
  it('gives the same answer for the same seed and a different one for another seed', () => {
    const first = risk.simulateRisk(project);
    expect(risk.simulateRisk(project)).toEqual(first);
    expect(risk.simulateRisk({ ...project, seed: 7 }).npv).not.toEqual(first.npv);
  });

  it('centres on the deterministic plan when price does not vary', () => {
    const result = risk.simulateRisk({ ...project, priceSigmaLog: 0 });
    const plannedProfit = 300 * CULTIVABLE_AREA_SHARE * 12 * 25 * 0.6;
    // Yield varies around the user's figure, the range is slightly skewed, so allow a few percent.
    expect(result.annualProfit.p50).toBeGreaterThan(plannedProfit * 0.95);
    expect(result.annualProfit.p50).toBeLessThan(plannedProfit * 1.05);
  });

  it('a better price lowers the chance of a loss', () => {
    const cheap = risk.simulateRisk({ ...project, pricePerUnit: 15 });
    const dear = risk.simulateRisk({ ...project, pricePerUnit: 40 });
    expect(dear.probabilities.loss).toBeLessThan(cheap.probabilities.loss);
    expect(dear.npv.p50).toBeGreaterThan(cheap.npv.p50);
  });

  it('reports payback as not within the horizon when a project never pays back', () => {
    const result = risk.simulateRisk({ ...project, yieldPerSqm: 1, years: 5 });
    expect(result.paybackYears.p50).toBeNull();
    expect(result.probabilities.loss).toBe(1);
    expect(result.probabilities.paybackWithin).toEqual({ 3: 0, 5: 0 });
  });

  it('keeps every number in range: probabilities, percentiles, histogram and drivers', () => {
    const result = risk.simulateRisk(project);
    expect(result.npv.p10).toBeLessThanOrEqual(result.npv.p50);
    expect(result.npv.p50).toBeLessThanOrEqual(result.npv.p90);
    for (const value of Object.values(result.probabilities.paybackWithin) as number[]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(result.histogram.reduce((sum: number, bin: { count: number }) => sum + bin.count, 0)).toBe(result.trials);
    const ranges = result.drivers.map((driver: { range: number }) => driver.range);
    expect(ranges).toEqual([...ranges].sort((a, b) => b - a));
    expect(result.drivers.map((driver: { driver: string }) => driver.driver).sort()).toEqual(['buildCost', 'operatingCost', 'price', 'yield']);
  });

  it('never pays out more than the scheme cap', () => {
    const big = { ...project, areaSqm: 20000, capitalCostInr: 30_000_000, subsidyOwnCostInr: 29_000_000, scheme: { normCostInr: 16_880_000, capInr: 5_600_000 } };
    const capped = risk.simulateRisk({ ...big, priceSigmaLog: 0, yieldPerSqm: 0.0001 });
    // With almost no revenue, the loss is the net investment: at least capital minus the Rs 56 lakh cap (less the cost band).
    expect(capped.npv.p50).toBeLessThan(-(30_000_000 * 0.9 - 5_600_000));
  });

  it('reads a yield range from the crop text', () => {
    expect(risk.yieldRangeFrom('45-84 t/ha')).toEqual({ low: 45, high: 84 });
    expect(risk.yieldRangeFrom('132-396 stems/m2/year')).toEqual({ low: 132, high: 396 });
    expect(risk.yieldRangeFrom('unknown')).toBeNull();
  });

  it('uses the same cropped share as the returns panel', () => {
    expect(risk.CULTIVABLE_AREA_SHARE).toBe(CULTIVABLE_AREA_SHARE);
  });
});

describe('POST /api/risk/simulate', () => {
  const config = {
    length: 30, width: 10, gutterHeight: 4, ridgeHeight: 6, greenhouseType: 'naturally-ventilated', roofType: 'gable',
    structureMaterial: 'gi-steel', coverMaterial: 'uv-polyfilm', sideVentilation: 'manual-rollup', doorEntry: 'single-sliding',
    selectedCrop: 'tomato', irrigationSystem: 'drip', state: 'Goa', district: 'North Goa',
  };
  const assumptions = { subsidyPct: 50, yieldPerSqm: 12, pricePerUnit: 25, operatingCostPct: 40 };
  const simulate = (body: object) => request(app).post('/api/risk/simulate').send(body);

  it('simulates a valid setup and says where each range came from', async () => {
    const response = await simulate({ config, assumptions });
    expect(response.status).toBe(200);
    const { simulation, sources } = response.body;
    expect(simulation).toMatchObject({ trials: 5000, years: 5 });
    expect(sources.yield).toMatchObject({ range: '45-84 t/ha', published: true });
    expect(sources.price.basis).toBe('assumption'); // no database in this test
    expect(sources.subsidy).toMatchObject({ scheme: 'NHM', normPerSqmInr: 1200 });
  });

  it.each([
    ['no assumptions', { config }],
    ['a negative price', { config, assumptions: { ...assumptions, pricePerUnit: -5 } }],
    ['too many trials', { config, assumptions, options: { trials: 1_000_000 } }],
    ['a 50-year horizon', { config, assumptions, options: { years: 50 } }],
  ])('rejects %s', async (_label, body) => {
    expect((await simulate(body)).status).toBe(400);
  });

  it('rejects a setup the planner itself rejects, with its field messages', async () => {
    const response = await simulate({ config: { ...config, length: 100000 }, assumptions });
    expect(response.status).toBe(400);
    expect(response.body.errors.length).toMatch(/Length must be between/);
  });
});
