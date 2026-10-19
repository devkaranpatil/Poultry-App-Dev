/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const app = require('../../backend/app');
const db = require('../../backend/config/db');
const { loadReferenceData } = require('../../backend/scripts/loadReferenceData');
const { normSelector, clearReferenceCache } = require('../../backend/services/referenceData');

const goa = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  polyhouseType: 'naturally-ventilated',
  roofType: 'gable',
  structureMaterial: 'gi-steel',
  coverMaterial: 'uv-polyfilm',
  sideVentilation: 'manual-rollup',
  doorEntry: 'single-sliding',
  state: 'Goa',
  district: 'North Goa',
};

const calculate = (body: object, kind = 'polyhouse') => request(app).post(`/api/${kind}/calculate`).send(body);

describe('without a database', () => {
  it('still calculates, with reference set to null, and still works out the scheme subsidy', async () => {
    const res = await calculate(goa);
    expect(res.status).toBe(200);
    expect(res.body.data.cost.totalCost).toBe(495338);
    expect(res.body.data.reference).toBeNull();
    expect(res.body.data.subsidy).toMatchObject({ scheme: 'NHM', normPerSqmInr: 1200, amountInr: 180_000 });
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

  it('never changes the price: the Goa benchmark is still 495,338', async () => {
    const res = await calculate(goa);
    expect(res.body.data.cost.totalCost).toBe(495338);
    expect(res.body.data.cost.costPerSqm).toBe(1651);
  });

  it('attaches the MIDH 2025 norm for a state-mission project, with the published slab rate', async () => {
    const { governmentNorm } = (await calculate(goa)).body.data.reference;
    expect(governmentNorm).toMatchObject({
      component: 'Green House Structure',
      structureType: 'Naturally ventilated - Tubular structure',
      normPerSqmInr: 1200, // MIDH 2025 B.5: tubular, up to 500 sq m
      hillyNormPerSqmInr: null,
      normCostInr: 300 * 1200,
      yourStructureAndCoverInr: 255000 + 36000,
    });
    expect(governmentNorm.sourceUrl).toMatch(/^https:\/\/nhb\.gov\.in\/.*MIDH/);
  });

  it('pays 50% of the cost the norm recognises, which is the smaller of the real cost and the norm', async () => {
    const res = await calculate(goa);
    const { indicativeSubsidy, areaLimit } = res.body.data.reference;
    // Build cost without irrigation (495,338 - 16,500 x 1.05) is 478,013, above the 360,000 norm.
    expect(indicativeSubsidy).toMatchObject({ scheme: 'NHM', percent: 50, eligibleAreaSqm: 300, amountInr: 180_000, cappedAtInr: null });
    expect(indicativeSubsidy.disclaimer).toMatch(/Indicative only/);
    expect(areaLimit.exceedsLimit).toBe(false);
    expect(res.body.data.subsidy.amountInr).toBe(180_000); // the card and the calculation agree
  });

  it('hands projects of 4,000 sq m and above to the NHB scheme, on the whole area', async () => {
    const big = { ...goa, length: 100, width: 60 }; // 6,000 sq m
    const { areaLimit, indicativeSubsidy, governmentNorm } = (await calculate(big)).body.data.reference;
    expect(areaLimit).toMatchObject({ limitSqm: 4000, exceedsLimit: true, effectiveFrom: '2025-08-12' });
    expect(governmentNorm).toMatchObject({ normPerSqmInr: 844, hillyNormPerSqmInr: 970 });
    expect(indicativeSubsidy).toMatchObject({ scheme: 'NHB', eligibleAreaSqm: 6000, amountInr: 0.5 * 844 * 6000, cappedAtInr: null });
  });

  it('limits NHB assistance to the published Rs 56 lakh per project', async () => {
    const huge = { ...goa, length: 200, width: 100 }; // 20,000 sq m: 50% of the norm would be Rs 84.4 lakh
    const { indicativeSubsidy } = (await calculate(huge)).body.data.reference;
    expect(indicativeSubsidy).toMatchObject({ scheme: 'NHB', amountInr: 5_600_000, cappedAtInr: 5_600_000 });
  });

  it('picks the norm row by structure type and material', async () => {
    const pick = async (extra: object) => (await calculate({ ...goa, ...extra })).body.data.reference.governmentNorm;
    expect((await pick({ polyhouseType: 'climate-controlled' })).normPerSqmInr).toBe(1800);
    expect((await pick({ structureMaterial: 'bamboo' })).normPerSqmInr).toBe(450);
    expect((await pick({ polyhouseType: 'shade-net', coverMaterial: 'shade-net', sideVentilation: 'none', doorEntry: 'curtain' })).normPerSqmInr).toBe(710);
    expect(normSelector({ structureType: 'shade-net', structureMaterial: 'bamboo' })).toEqual({ component: 'Shade Net House', structure: 'Bamboo structure' });
  });

  it('adds the district climate for a resolved district, leaving the cost adjustment on state data', async () => {
    const res = await calculate({ ...goa, state: 'Kerala', district: 'Ernakulam' });
    const { districtClimate } = res.body.data.reference;
    expect(districtClimate.months).toHaveLength(12);
    expect(districtClimate.annualRainfallMm).toBeGreaterThan(2000); // wet tropical coast
    expect(districtClimate.hottestMonthMaxTempC).toBeGreaterThan(districtClimate.coldestMonthMinTempC);
    expect(districtClimate.source).toMatch(/NASA POWER/);
    expect(res.body.data.climate.climateFactor).toBe(1.05); // state-level rule, unchanged
  });

  it.each([
    ['Arunachal Pradesh', 'Anjaw', 1380], // NE state: 15% above the 1,200 slab rate
    ['Goa', 'North Goa', 1200],
  ])('returns district climate as null for %s / %s (could not be placed), but still returns the norm', async (state, district, norm) => {
    const res = await calculate({ ...goa, state, district });
    expect(res.status).toBe(200);
    expect(res.body.data.reference.districtClimate).toBeNull();
    expect(res.body.data.reference.governmentNorm.normPerSqmInr).toBe(norm);
  });

  it('is available on the greenhouse endpoint too', async () => {
    const res = await calculate({ ...goa, greenhouseType: 'naturally-ventilated', polyhouseType: undefined }, 'greenhouse');
    expect(res.status).toBe(200);
    expect(res.body.data.reference.governmentNorm.normPerSqmInr).toBe(1200);
  });
});
