/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const mc = require('../../backend/services/risk/monteCarlo');
const app = require('../../backend/app');

/** A 1,076-bird open broiler shed in Nagpur. */
const shed = {
  length: 20,
  width: 5,
  eavesHeight: 2.1,
  ridgeHeight: 3.5,
  housingSystem: 'open-sided',
  roofType: 'gable',
  frameMaterial: 'steel-truss',
  roofSheet: 'gi-sheet',
  sideWalls: 'mesh-curtain',
  entry: 'door-footbath',
  birdType: 'broiler',
  feedingSystem: 'manual',
  state: 'Maharashtra',
  district: 'Nagpur',
};

describe('Monte Carlo building blocks', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = mc.createRandom(7);
    const b = mc.createRandom(7);
    const c = mc.createRandom(8);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(c()).not.toBe(first[0]);
  });

  it('draws triangular values between low and high, most often near the mode', () => {
    expect(mc.triangular(0, 1, 2, 4)).toBe(1);
    expect(mc.triangular(0.999999, 1, 2, 4)).toBeCloseTo(4, 2);
    expect(mc.triangular(1 / 3, 1, 2, 4)).toBeCloseTo(2, 6);
    expect(mc.triangular(0.5, 3, 3, 3)).toBe(3);
  });

  it('reads quantiles and builds a 20-bin histogram', () => {
    const sorted = Array.from({ length: 101 }, (_, i) => i);
    expect(mc.quantile(sorted, 0.5)).toBe(50);
    expect(mc.quantile([], 0.5)).toBeNull();
    const bins = mc.histogram(sorted);
    expect(bins).toHaveLength(20);
    expect(bins.reduce((sum: number, bin: { count: number }) => sum + bin.count, 0)).toBe(101);
  });
});

describe('POST /api/risk/simulate', () => {
  const simulate = (body: object) => request(app).post('/api/risk/simulate').send(body);

  it('simulates a valid setup and says where each range came from', async () => {
    const response = await simulate({ config: shed, options: { trials: 1000 } });
    expect(response.status).toBe(200);
    const { simulation, sources } = response.body;
    expect(simulation).toMatchObject({ trials: 1000, years: 5 });
    expect(simulation.probabilities.loss).toBeGreaterThanOrEqual(0);
    expect(simulation.probabilities.loss).toBeLessThanOrEqual(1);
    expect(simulation.drivers.map((d: { driver: string }) => d.driver).sort()).toEqual(['buildCost', 'fcr', 'feedPrice', 'mortality', 'outbreak', 'salePrice']);
    expect(sources.price.basis).toBe('assumption');
    expect(sources.buildCost.high).toBeGreaterThan(sources.buildCost.low);
  });

  it.each([
    ['no setup', {}],
    ['a negative price', { config: shed, assumptions: { saleInrPerKg: -5 } }],
    ['too many trials', { config: shed, options: { trials: 1_000_000 } }],
    ['a 50-year horizon', { config: shed, options: { years: 50 } }],
    ['an outbreak chance of 80%', { config: shed, risk: { outbreakChancePct: 80 } }],
  ])('rejects %s', async (_label, body) => {
    expect((await simulate(body)).status).toBe(400);
  });

  it('rejects a setup the planner itself rejects, with its field messages', async () => {
    const response = await simulate({ config: { ...shed, length: 100000 } });
    expect(response.status).toBe(400);
    expect(response.body.errors.length).toMatch(/Length must be between/);
  });
});
