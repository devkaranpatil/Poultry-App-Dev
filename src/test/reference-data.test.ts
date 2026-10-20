/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const app = require('../../backend/app');
const db = require('../../backend/config/db');
const { loadReferenceData } = require('../../backend/scripts/loadReferenceData');
const { clearReferenceCache } = require('../../backend/services/referenceData');
const { runPoultryCalculation } = require('../../backend/services/poultry/calculator');

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

const calculate = (config: object) => request(app).post('/api/farm/calculate').send({ config });

describe('without a database', () => {
  it('still calculates, with reference set to null', async () => {
    const res = await calculate(shed);
    expect(res.status).toBe(200);
    expect(res.body.data.reference).toBeNull();
    expect(res.body.data.flock.birds).toBe(1076);
  });
});

describe('with the official datasets loaded', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'pglite:memory';
    await db.connectDb();
    await loadReferenceData(db.query);
    clearReferenceCache();
  }, 90_000);

  afterAll(async () => {
    await db.closeDb();
    clearReferenceCache();
  });

  it('never changes the figures', async () => {
    const withDb = (await calculate(shed)).body.data;
    expect(withDb.reference.districtClimate).not.toBeNull();
    const { result } = runPoultryCalculation(shed);
    expect(withDb.cost).toEqual(result.cost);
    expect(withDb.returns).toEqual(result.returns);
  });

  it('adds the district climate for a resolved district', async () => {
    const res = await calculate({ ...shed, state: 'Kerala', district: 'Ernakulam' });
    const { districtClimate } = res.body.data.reference;
    expect(districtClimate.months).toHaveLength(12);
    expect(districtClimate.annualRainfallMm).toBeGreaterThan(2000); // wet tropical coast
    expect(districtClimate.hottestMonthMaxTempC).toBeGreaterThan(districtClimate.coldestMonthMinTempC);
    expect(districtClimate.source).toMatch(/NASA POWER/);
  });

  it.each([
    ['Arunachal Pradesh', 'Anjaw'],
    ['Goa', 'North Goa'],
  ])('returns district climate as null for %s / %s (could not be placed)', async (state, district) => {
    const res = await calculate({ ...shed, state, district });
    expect(res.status).toBe(200);
    expect(res.body.data.reference.districtClimate).toBeNull();
  });
});
