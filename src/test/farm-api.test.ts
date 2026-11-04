/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
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

describe('farm API integration', () => {
  it('returns backend health payload', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('healthy');
    expect(response.body.service).toBe('farm-backend');
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('returns backend meta payload', async () => {
    const response = await request(app).get('/api/meta');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.service).toBe('farm-backend');
    expect(response.body.rateLimit.max).toBeGreaterThan(0);
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('calculates a shed: flock, cost, schemes, siting, climate, returns and calendar', async () => {
    const response = await request(app).post('/api/farm/calculate').send({ config: shed });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const data = response.body.data;
    expect(data.flock.birds).toBe(1076);
    expect(data.cost.capitalCost).toBeGreaterThan(400000);
    expect(data.cost.projectCost).toBe(data.cost.capitalCost + data.cost.workingCapital.total);
    expect(data.nabard).toMatchObject({ state: 'Maharashtra', year: '2025-26', unitBirds: 5000, otherState: false }); // Nagpur: Maharashtra's own units
    expect(data.schemes.schemes).toHaveLength(3);
    expect(data.siting.length).toBeGreaterThan(0);
    expect(data.climate.heatStress.severeMonths).toEqual(['APR', 'MAY', 'JUN']);
    expect(data.returns.cyclesPerYear).toBeCloseTo(365 / 56, 6);
    expect(data.calendar).toHaveLength(7);
    expect(data.reference).toBeNull(); // no database in this test
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('applies the planning assumptions sent with the setup', async () => {
    const base = await request(app).post('/api/farm/calculate').send({ config: shed });
    const dearer = await request(app).post('/api/farm/calculate').send({ config: shed, assumptions: { saleInrPerKg: 120 } });
    expect(dearer.body.data.assumptions.saleInrPerKg).toBe(120);
    expect(dearer.body.data.returns.annualProfit).toBeGreaterThan(base.body.data.returns.annualProfit);
  });

  it('returns field messages for an invalid setup', async () => {
    const response = await request(app).post('/api/farm/calculate').send({ config: { ...shed, length: 0, state: '' } });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
    expect(Object.keys(response.body.errors)).toEqual(expect.arrayContaining(['length', 'stateName']));
  });

  it('rejects a body without a setup', async () => {
    const response = await request(app).post('/api/farm/calculate').send({ length: 20 });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/shed configuration is required/);
  });

  it('no longer serves the polyhouse endpoints', async () => {
    for (const path of ['/api/farm/estimate-cost', '/api/farm/crop-suggestions', '/api/farm/farm-config', '/api/poultry/calculate']) {
      expect((await request(app).post(path).send({ config: shed })).status, path).toBe(404);
    }
  });

  it('works out a floor area', async () => {
    const response = await request(app).post('/api/farm/calculate-area').send({ length: 20, width: 5 });
    expect(response.body.area).toBe(100);
    expect((await request(app).post('/api/farm/calculate-area').send({ length: 0, width: 5 })).status).toBe(400);
  });
});
