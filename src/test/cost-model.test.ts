/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const costModel = require('../../backend/services/costModel');
const pricing = require('../../backend/data/pricing');
const { __testables: farm } = require('../../backend/routes/farm');
const { validateFarmConfig } = require('../../backend/validators/farmValidator');
const app = require('../../backend/app');

const base = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  roofType: 'gable',
  structureMaterial: 'gi-steel',
  coverMaterial: 'uv-polyfilm',
  sideVentilation: 'manual-rollup',
  doorEntry: 'single-sliding',
  state: 'Goa',
  district: 'North Goa',
};

describe('volume formula', () => {
  const dims = { length: 30, width: 10, gutterHeight: 4, ridgeHeight: 7 };

  it('uses gutter height for flat roofs', () => {
    expect(costModel.computeVolume({ ...dims, ridgeHeight: 4, roofType: 'flat' })).toBe(300 * 4);
  });

  it('adds half the rise for a gable (triangle fills half its bounding box)', () => {
    expect(costModel.computeVolume({ ...dims, roofType: 'gable' })).toBeCloseTo(300 * (4 + 3 / 2));
  });

  it('adds two thirds of the rise for a gothic arch', () => {
    expect(costModel.computeVolume({ ...dims, roofType: 'gothic' })).toBeCloseTo(300 * (4 + 2));
  });

  it('never goes below the gutter box if ridge is lower than gutter', () => {
    expect(costModel.computeVolume({ ...dims, ridgeHeight: 2, roofType: 'gable' })).toBe(300 * 4);
  });
});

describe('climate factor', () => {
  it('is a flat 1.00 for a mild climate', () => {
    expect(costModel.getClimateFactor({ rainfall: 1000, temp: 25 })).toBe(1);
  });

  it('adds 5% above 2000 mm rainfall and 3% above 30 C, stacking additively', () => {
    expect(costModel.getClimateFactor({ rainfall: 2500, temp: 25 })).toBe(1.05);
    expect(costModel.getClimateFactor({ rainfall: 1000, temp: 25, hottestMonthMeanC: 35 })).toBe(1.03);
    expect(costModel.getClimateFactor({ rainfall: 2500, temp: 25, hottestMonthMeanC: 35 })).toBe(1.08);
    // The annual mean no longer matters, and an unknown hottest month adds nothing.
    expect(costModel.getClimateFactor({ rainfall: 1000, temp: 32, hottestMonthMeanC: 34.9 })).toBe(1);
    expect(costModel.getClimateFactor({ rainfall: 1000, temp: 32, hottestMonthMeanC: null })).toBe(1);
  });
});

describe('cost reconciliation', () => {
  it('component lines plus the climate surcharge equal the total', () => {
    const config = farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'climate-controlled' });
    const { cost } = farm.buildCalculationResult(config);
    const lines =
      cost.structureCost + cost.coverCost + cost.ventilationCost + cost.foundationCost +
      cost.irrigationCost + cost.electricalCost + cost.laborCost + cost.miscCost;
    expect(lines + cost.climateAdjustmentAmount).toBe(cost.totalCost);
    expect(cost.electricalCost).toBe(300 * pricing.CLIMATE_CONTROL_RATE_PER_SQM);
  });

  it('charges labour at 25% of structure, cover and foundation', () => {
    const config = farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated' });
    const { cost } = farm.buildCalculationResult(config);
    expect(cost.laborCost).toBe(Math.round((cost.structureCost + cost.coverCost + cost.foundationCost) * 0.25));
  });
});

describe('district heat surcharge (NASA hottest-month mean)', () => {
  const factorFor = (state: string, district: string) =>
    farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated', state, district }));

  it('adds 3% for a district whose hottest month averages 35 C or more', () => {
    const churu = factorFor('Rajasthan', 'Churu'); // hottest month 35.9 C (June)
    expect(churu.climate.hottestMonthMeanC).toBe(35.9);
    expect(churu.climate.climateFactor).toBe(1.03);
    expect(churu.climate.advisories.join(' ')).toMatch(/High temperature/);
  });

  it('adds nothing for a cooler district in the same kind of state', () => {
    const pune = factorFor('Maharashtra', 'Pune'); // hottest month 28.9 C (April)
    expect(pune.climate.hottestMonthMeanC).toBe(28.9);
    expect(pune.climate.climateFactor).toBe(1);
  });

  it('falls back to the state average hottest month when no district is chosen', () => {
    const state = farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated', state: 'Rajasthan', district: '' }));
    expect(state.climate.hottestMonthMeanC).toBe(35.1);
  });

  it('has no heat data for states NASA could not resolve, and the Goa benchmark is unchanged', () => {
    const goa = factorFor('Goa', 'North Goa');
    expect(goa.climate.hottestMonthMeanC).toBeNull();
    expect(goa.cost.totalCost).toBe(495338);
  });
});

describe('rates derived from the official cost norms', () => {
  const norm = pricing.OFFICIAL_NORM_PER_SQM;
  const structureFor = (extra: object) =>
    farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, ...extra })).cost.structureCost;

  it('prices fan-and-pad cooling as the official fan-and-pad minus tubular norm, scaled by the model uplift', () => {
    expect(norm.fanAndPad - norm.naturallyVentilatedTubular).toBe(556);
    expect(pricing.CLIMATE_CONTROL_RATE_PER_SQM).toBe(Math.round((556 * 970) / 844)); // 639
  });

  it('makes a shade-net structure cheaper by the official shade-net to covered-house ratio', () => {
    const covered = structureFor({ greenhouseType: 'naturally-ventilated' });
    const shade = structureFor({ greenhouseType: 'shade-net', coverMaterial: 'shade-net', sideVentilation: 'none', doorEntry: 'curtain' });
    expect(shade / covered).toBeCloseTo(norm.shadeNetTubular / norm.naturallyVentilatedTubular, 3);

    const bambooCovered = structureFor({ greenhouseType: 'naturally-ventilated', structureMaterial: 'bamboo' });
    const bambooShade = structureFor({ greenhouseType: 'shade-net', structureMaterial: 'bamboo', coverMaterial: 'shade-net', sideVentilation: 'none', doorEntry: 'curtain' });
    expect(bambooShade / bambooCovered).toBeCloseTo(norm.shadeNetBamboo / norm.naturallyVentilatedBamboo, 3);
  });

  it('keeps the covered-house benchmark unchanged', () => {
    const { cost } = farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated' }));
    expect(cost.totalCost).toBe(495338);
  });

  it('lists the inputs that do not change the price, and really does not price them', () => {
    const run = (extra: object) =>
      farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated', ...extra }));
    const baseline = run({});
    expect(baseline.diagnostics.notPriced).toEqual(['doorType', 'selectedCrop', 'district']);
    expect(run({ doorEntry: 'roll-up' }).cost.totalCost).toBe(baseline.cost.totalCost);
    expect(run({ selectedCrop: 'strawberry' }).cost.totalCost).toBe(baseline.cost.totalCost);
  });

  it('prices roof shape and heights through the envelope surface relative to the NHB reference house', () => {
    const run = (extra: object) =>
      farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated', ...extra }));
    const baseline = run({});
    expect(baseline.diagnostics.envelopeFactor).toBe(1); // gutter 4 m, ridge 6 m, gable = the reference design

    const taller = run({ gutterHeight: 5, ridgeHeight: 7 });
    const lower = run({ gutterHeight: 3, ridgeHeight: 5 });
    expect(taller.cost.totalCost).toBeGreaterThan(baseline.cost.totalCost);
    expect(lower.cost.totalCost).toBeLessThan(baseline.cost.totalCost);
    expect(run({ roofType: 'gothic' }).cost.totalCost).toBeGreaterThan(baseline.cost.totalCost);
    expect(run({ roofType: 'flat' }).cost.totalCost).toBeLessThan(baseline.cost.totalCost);

    // Only the frame and the cover follow the envelope; the floor-area items do not.
    expect(taller.cost.foundationCost).toBe(baseline.cost.foundationCost);
    expect(taller.cost.irrigationCost).toBe(baseline.cost.irrigationCost);
    expect(taller.cost.structureCost / baseline.cost.structureCost).toBeCloseTo(taller.diagnostics.envelopeFactor, 2);
    expect(taller.cost.coverCost / baseline.cost.coverCost).toBeCloseTo(taller.diagnostics.envelopeFactor, 2);
  });

  it('computes the envelope surface from first principles', () => {
    const dims = { length: 30, width: 10, gutterHeight: 4 };
    // Walls 2*(30+10)*4 = 320; two triangular ends 2*(10*2/2) = 20; two slopes 30*2*hypot(5,2).
    expect(costModel.computeEnvelopeArea({ ...dims, ridgeHeight: 6, roofType: 'gable' })).toBeCloseTo(320 + 20 + 60 * Math.hypot(5, 2), 6);
    // A flat roof is its footprint on top of the walls.
    expect(costModel.computeEnvelopeArea({ ...dims, ridgeHeight: 4, roofType: 'flat' })).toBeCloseTo(320 + 300, 6);
  });
});

describe('climate coverage', () => {
  it('uses real state climate data for states outside the original 11 (Assam is heavy-rain, humid)', () => {
    const config = farm.normalizeAndSanitizeConfig({
      ...base,
      greenhouseType: 'naturally-ventilated',
      state: 'Assam',
      district: 'Kamrup',
    });
    const result = farm.buildCalculationResult(config);
    expect(result.climate.rainfall).toBe(2800);
    expect(result.climate.climateGroup).toBe('Warm & Humid');
    expect(result.cost.climateAdjustment).toBe(0.05);
  });
});

describe('validator parity', () => {
  const valid = {
    ...base,
    stateName: 'Goa',
    doorType: 'single-sliding',
    selectedCrop: 'tomato',
    irrigationSystem: 'drip',
    structureMaterial: 'galvanized_iron',
    coverMaterial: 'uv_polyfilm',
  };

  it('enforces the dimension limits', () => {
    const tooBig = { ...valid, greenhouseType: 'naturally-ventilated', length: 5000 };
    expect(validateFarmConfig(tooBig).length).toMatch(/between 5 and 200/);
  });

  it('rejects unknown roof, structure and ventilation values instead of pricing them silently', () => {
    const errors = validateFarmConfig({
      ...valid,
      greenhouseType: 'naturally-ventilated',
      roofType: 'banana',
      structureMaterial: 'unobtainium',
      sideVentilation: 'teleport',
    });
    expect(errors.roofType).toBeTruthy();
    expect(errors.structureMaterial).toBeTruthy();
    expect(errors.sideVentilation).toBeTruthy();
  });

  it('both validators reject non-finite numbers', () => {
    expect(validateFarmConfig({ ...valid, greenhouseType: 'naturally-ventilated', length: Infinity }).length).toBeTruthy();
    expect(validateFarmConfig({ ...valid, greenhouseType: 'naturally-ventilated', width: 'Infinity' }).width).toBeTruthy();
  });
});

describe('calculate-area endpoint', () => {
  it.each(['farm'])('%s multiplies and rounds to 2 decimals', async (kind) => {
    const res = await request(app).post(`/api/${kind}/calculate-area`).send({ length: 12.345, width: 3 });
    expect(res.status).toBe(200);
    expect(res.body.area).toBe(37.04);
  });

  it.each([
    { length: 'Infinity', width: 5 },
    { length: '1e999', width: 5 },
    { length: '', width: 5 },
    { length: -1, width: 5 },
    { width: 5 },
  ])('rejects %j', async (body) => {
    const res = await request(app).post('/api/farm/calculate-area').send(body);
    expect(res.status).toBe(400);
  });
});

describe('cost range', () => {
  it('brackets the point estimate by +/-10%', () => {
    const config = farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated' });
    const { cost } = farm.buildCalculationResult(config);
    expect(cost.costRange.low).toBe(Math.round(cost.totalCost * 0.9));
    expect(cost.costRange.high).toBe(Math.round(cost.totalCost * 1.1));
    expect(cost.costRange.low).toBeLessThan(cost.totalCost);
  });
});

describe('materials without an official price', () => {
  const run = (extra: object) =>
    farm.buildCalculationResult(farm.normalizeAndSanitizeConfig({ ...base, greenhouseType: 'naturally-ventilated', ...extra }));

  it('flags an aluminium frame and a glass cover, and nothing else', () => {
    expect(run({}).diagnostics.unsourcedRates).toEqual([]);
    expect(run({ structureMaterial: 'aluminium' }).diagnostics.unsourcedRates).toEqual(['aluminium']);
    expect(run({ coverMaterial: 'glass-panel' }).diagnostics.unsourcedRates).toEqual(['glass']);
    expect(run({ structureMaterial: 'aluminium', coverMaterial: 'glass-panel' }).diagnostics.unsourcedRates).toEqual(['aluminium', 'glass']);
    expect(run({ structureMaterial: 'bamboo' }).diagnostics.unsourcedRates).toEqual([]);
  });
});

describe('district rainfall from the IMD normals', () => {
  const { buildProfiles } = require('../../backend/scripts/buildRainfallProfiles');
  const rainfallProfiles = require('../../backend/data/rainfallProfiles.json');
  const locations = { Odisha: ['Puri', 'Khordha'], Telangana: ['Hyderabad', 'Warangal'], Goa: ['North Goa'], Assam: ['Kamrup'] };
  const csv = [
    'STATE/UT,DISTRICT,JAN,ANNUAL',
    'ORISSA,PURI,10,"1,450.5"', // renamed state, thousands separator
    'ANDHRA PRADESH,HYDERABAD,2,780', // Telangana was part of Andhra Pradesh then: matched by its unique name
    'GOA,NORTH GOA DISTRICT,1,3000', // a trailing word is ignored
    'ASSAM,UNKNOWN PLACE,1,2000', // not in the app
    'ASSAM,KAMRUP,1,NA', // no usable value
    'ASSAM,KAMRUP,1,99999', // outside any real annual total
  ].join('\n');

  it('matches IMD rows to the app districts and reports what it could not match', () => {
    const { districts, unmatched, skipped } = buildProfiles(csv, locations);
    expect(districts).toEqual({
      'Odisha|Puri': { annualMm: 1451 },
      'Telangana|Hyderabad': { annualMm: 780 },
      'Goa|North Goa': { annualMm: 3000 },
    });
    expect(unmatched).toEqual([{ state: 'ASSAM', district: 'UNKNOWN PLACE', annualMm: 2000 }]);
    expect(skipped).toBe(2);
  });

  it('refuses a file without the columns it needs', () => {
    expect(() => buildProfiles('a,b\n1,2', locations)).toThrow(/STATE, DISTRICT and ANNUAL/);
  });

  it('does not guess when a district name exists in more than one state', () => {
    const twin = { Bihar: ['Aurangabad'], Maharashtra: ['Aurangabad'] };
    const { districts, unmatched } = buildProfiles('STATE,DISTRICT,ANNUAL\nCENTRAL,AURANGABAD,900', twin);
    expect(districts).toEqual({});
    expect(unmatched).toHaveLength(1);
  });

  it('uses the district value over the typed state value, and says which it used', () => {
    expect(costModel.getClimateData('Goa', 'North Goa')).toMatchObject({ rainfall: 2900, rainfallSource: 'state' });
    rainfallProfiles.districts['Goa|North Goa'] = { annualMm: 3100 };
    try {
      expect(costModel.getClimateData('Goa', 'North Goa')).toMatchObject({ rainfall: 3100, rainfallSource: 'district' });
      // Other districts of the state are unaffected.
      expect(costModel.getClimateData('Goa', 'South Goa').rainfallSource).toBe('state');
    } finally {
      delete rainfallProfiles.districts['Goa|North Goa'];
    }
  });

  it('lets a wet district trigger the heavy-rain surcharge that its state average would not', () => {
    const dry = costModel.getClimateFactor({ rainfall: 1200, hottestMonthMeanC: 30 });
    const wet = costModel.getClimateFactor({ rainfall: 2600, hottestMonthMeanC: 30 });
    expect(wet).toBeGreaterThan(dry);
  });
});
