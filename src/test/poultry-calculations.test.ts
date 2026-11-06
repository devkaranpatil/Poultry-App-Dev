/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { poultryLoanTerms, computeLoanPlan } from '@/lib/loan';
import { batchCalendar, computePoultryReturns, defaultPoultryAssumptions, type PoultryAssumptions } from '@/lib/poultryFinance';
import { BIRD_TYPES, type BirdType } from '@/types/poultry';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const app = require('../../backend/app');
const costModel = require('../../backend/services/poultry/costModel');
const heat = require('../../backend/services/poultry/heatStress');
const production = require('../../backend/services/poultry/production');
const { runPoultryCalculation } = require('../../backend/services/poultry/calculator');
const { validatePoultryConfig } = require('../../backend/validators/poultryValidator');
const { simulatePoultryRisk } = require('../../backend/services/risk/poultryRisk');
const audit = require('../../backend/scripts/auditCalculations');

/** A 1,000-bird open broiler shed in Nagpur, close to the app's default. */
const SHED = {
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
  cageTiers: 3,
  farmingModel: 'independent',
  beneficiaryCategory: 'general',
  stateName: 'Maharashtra',
  district: 'Nagpur',
};
const LAYER_SHED = { ...SHED, length: 40, width: 8, birdType: 'layer-cage', feedingSystem: 'trough' };

describe('poultry cost model', () => {
  it('reproduces every NABARD 2023-24 unit cost within 10% from its own inputs', () => {
    const units = audit.auditNabardUnits();
    expect(units).toHaveLength(6);
    for (const unit of units) expect(Math.abs(unit.offShare), unit.unit).toBeLessThanOrEqual(audit.TOLERANCE);
  });

  it('prices the 500-bird broiler unit line by line as NABARD does', () => {
    const { cost } = costModel.calculateShedCost(audit.nabardShed('broiler', 500), 500, audit.NABARD_PRICES.broiler);
    expect(cost.civilCost).toBe(191400); // 600 sq ft at Rs 319
    expect(cost.equipmentCost).toBe(22500); // Rs 45 a bird
    expect(cost.electricalCost).toBe(5742); // 3% of civil
    expect(cost.workingCapital).toMatchObject({ chicks: 525, chickCost: 18375, feedCost: 45000, insuranceCost: 1103, vaccineCost: 16000, labourCost: 0 });
  });

  it('scales the roof and walls with the envelope, 1.00 for the shed NABARD prices', () => {
    expect(costModel.envelopeFactor(SHED)).toBe(1);
    expect(costModel.envelopeFactor({ ...SHED, roofType: 'monitor' })).toBeGreaterThan(1);
    expect(costModel.envelopeFactor({ ...SHED, eavesHeight: 3, ridgeHeight: 4.4 })).toBeGreaterThan(1);
    expect(costModel.envelopeFactor({ ...SHED, roofType: 'lean-to' })).toBeLessThan(costModel.envelopeFactor(SHED) + 0.2);
  });

  it('flags every chosen item that has no published price', () => {
    const plain = costModel.calculateShedCost(SHED, 1000);
    expect(plain.diagnostics.unsourcedRates).toEqual(['footbath']);
    const fancy = costModel.calculateShedCost({ ...SHED, roofSheet: 'puf-panel', sideWalls: 'mesh-auto-curtain', entry: 'anteroom', feedingSystem: 'automatic' }, 1000);
    expect(fancy.diagnostics.unsourcedRates).toEqual(['roof sheet: puf-panel', 'automatic curtains', 'footbath', 'anteroom size', 'equipment: automatic']);
    expect(fancy.cost.capitalCost).toBeGreaterThan(plain.cost.capitalCost);
  });

  it('adds the feed store, fencing and water supply for layers only, per 5,000 birds', () => {
    const layer = costModel.calculateShedCost(LAYER_SHED, 5000);
    expect(layer.cost).toMatchObject({ feedStoreCost: 27500, fencingCost: 12000, waterSupplyCost: 90000 });
    const broiler = costModel.calculateShedCost(SHED, 5000);
    expect(broiler.cost).toMatchObject({ feedStoreCost: 0, fencingCost: 0, waterSupplyCost: 0 });
  });

  it('compares with the nearest NABARD unit and recognises the lower cost', () => {
    const compared = costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'open-sided', flockSize: 800, projectCost: 900000 });
    expect(compared).toMatchObject({ unitBirds: 1000, perBirdInr: 692, normCostInr: 553600, recognisedCostInr: 553600, note: null }); // Jharkhand 2026-27: Rs 6,92,000 for 1,000 birds
    expect(costModel.nabardComparison({ birdType: 'desi', housingSystem: 'backyard', flockSize: 100, projectCost: 1 })).toBeNull();
    expect(costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'environment-controlled', flockSize: 1000, projectCost: 1 }).note).toMatch(/controlled/);
  });

  it("uses the project's own state when NABARD units for it are transcribed, else Jharkhand's", () => {
    const maharashtra = costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'open-sided', stateName: 'Maharashtra', flockSize: 1000, projectCost: 500000 });
    expect(maharashtra).toMatchObject({ state: 'Maharashtra', year: '2026-27', system: 'Deep litter, all in all out', unitBirds: 5000, otherState: false, capitalOnly: false });
    expect(maharashtra.perBirdInr).toBe(460); // Rs 23,02,055 for 5,000 birds
    // Every state in the planner has broiler units now; a place outside the list still gets Jharkhand's.
    const delhi = costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'open-sided', stateName: 'Delhi', flockSize: 1000, projectCost: 500000 });
    expect(delhi).toMatchObject({ state: 'Jharkhand', unitBirds: 1000, otherState: true });
    // Andhra Pradesh prints only a cost per bird (Rs 400-450, the top is kept), so the norm scales with the flock.
    const andhra = costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'open-sided', stateName: 'Andhra Pradesh', flockSize: 3000, projectCost: 1200000 });
    expect(andhra).toMatchObject({ state: 'Andhra Pradesh', year: '2026-27', perBirdNorm: true, perBirdInr: 450, normCostInr: 1350000, otherState: false });
    expect(costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'open-sided', stateName: 'Tamil Nadu', flockSize: 8000, projectCost: 1 }).perBirdNorm).toBe(false);
    const tamilNadu = costModel.nabardComparison({ birdType: 'broiler', housingSystem: 'open-sided', stateName: 'Tamil Nadu', flockSize: 8000, projectCost: 4000000 });
    expect(tamilNadu).toMatchObject({ state: 'Tamil Nadu', year: '2026-27', unitBirds: 10000, otherState: false });
    expect(tamilNadu.perBirdInr).toBe(599); // Rs 59,89,000 for 10,000 birds
    const tamilNaduLayers = costModel.nabardComparison({ birdType: 'layer-cage', housingSystem: 'open-sided', stateName: 'Tamil Nadu', flockSize: 12000, projectCost: 12000000 });
    expect(tamilNaduLayers).toMatchObject({ state: 'Tamil Nadu', unitBirds: 10000, unitCostInr: 11270000 });
  });

  it('compares a contract unit with the capital cost only', () => {
    const input = { birdType: 'broiler', housingSystem: 'open-sided', stateName: 'Maharashtra', flockSize: 5000, projectCost: 2000000, capitalCost: 1200000 };
    const contract = costModel.nabardComparison({ ...input, farmingModel: 'contract' });
    expect(contract).toMatchObject({ system: 'Deep litter, contract farming', unitCostInr: 1463800, ownCostInr: 1200000, capitalOnly: true });
    expect(costModel.nabardComparison(input)).toMatchObject({ unitCostInr: 2302055, ownCostInr: 2000000, capitalOnly: false });
    // Maharashtra's controlled unit is a contract one: no "open-sided only" note, and the capital cost is compared.
    const controlled = costModel.nabardComparison({ ...input, housingSystem: 'environment-controlled', flockSize: 15000 });
    expect(controlled).toMatchObject({ unitBirds: 15000, unitCostInr: 6207000, capitalOnly: true, note: null });
  });
});

describe('heat stress', () => {
  it('computes the wet bulb by Stull (2011) and weights it by bird', () => {
    expect(heat.wetBulbC(20, 50)).toBeCloseTo(13.7, 1);
    expect(heat.thi(35, 30, 'meat')).toBeGreaterThan(heat.thi(35, 30, 'eggs'));
  });

  it('flags the hot months of a hot district and none in a mild one', () => {
    const nagpur = heat.assessHeatStress({ stateName: 'Maharashtra', district: 'Nagpur', product: 'meat', housingSystem: 'open-sided' });
    expect(nagpur.basis).toBe('district');
    expect(nagpur.severeMonths).toEqual(['APR', 'MAY', 'JUN']);
    expect(nagpur.advice[0]).toMatch(/foggers/);
    const pune = heat.assessHeatStress({ stateName: 'Maharashtra', district: 'Pune', product: 'meat', housingSystem: 'open-sided' });
    expect(pune.severeMonths).toEqual([]);
    expect(pune.advice).toEqual([]);
  });

  it('falls back to the state and tells a controlled shed to keep its fans running', () => {
    const state = heat.assessHeatStress({ stateName: 'Rajasthan', district: 'Nowhere', product: 'meat', housingSystem: 'environment-controlled' });
    expect(state.basis).toBe('state');
    expect(state.advice[0]).toMatch(/generator/);
    expect(heat.assessHeatStress({ stateName: 'Atlantis', product: 'meat' })).toBeNull();
  });
});

describe('poultry production and returns', () => {
  const cases: Array<[BirdType, 'independent' | 'contract', number, number]> = [
    ['broiler', 'independent', 1000, 600000],
    ['broiler', 'contract', 5000, 2200000],
    ['desi', 'independent', 100, 12000],
    ['layer-cage', 'independent', 5000, 3200000],
    ['layer-floor', 'independent', 1200, 900000],
  ];

  it('gives the same figures in the browser and on the server', () => {
    for (const [birdType, model, flockSize, projectCost] of cases) {
      for (const edit of [{}, { subsidyInr: 100000 }, { feedInrPerKg: 34, chickInr: 45 }]) {
        const assumptions = { ...defaultPoultryAssumptions(birdType, model), ...edit } as PoultryAssumptions;
        expect(production.defaultAssumptions(birdType, model)).toEqual(defaultPoultryAssumptions(birdType, model));
        const server = production.computePoultryReturns({ birdType, flockSize, projectCost, assumptions });
        expect(computePoultryReturns({ birdType, flockSize, projectCost, assumptions }), `${birdType} ${model}`).toEqual(server);
        expect(batchCalendar(birdType, assumptions)).toEqual(production.batchCalendar({ birdType, assumptions }));
      }
    }
  });

  it('starts from the same defaults in the browser and on the server in every state with its own prices', () => {
    // The price lookup is written twice (TypeScript here, CommonJS in the backend); this keeps the two in step.
    const states = new Set<string>(['', 'Sikkim']);
    JSON.stringify(require('../../shared/poultry-norms.json'), (key, value) => {
      if (key === 'byState') Object.keys(value).forEach((state) => states.add(state));
      return value;
    });
    expect(states.size).toBeGreaterThan(5);
    for (const [birdType, model] of cases) {
      for (const state of states) {
        expect(defaultPoultryAssumptions(birdType, model, state), `${birdType} ${model} ${state}`).toEqual(
          production.defaultAssumptions(birdType, model, state)
        );
      }
    }
  });

  it('runs about 6.5 broiler batches a year and sells live weight less mortality', () => {
    const a = defaultPoultryAssumptions('broiler');
    const r = computePoultryReturns({ birdType: 'broiler', flockSize: 1000, projectCost: 600000, assumptions: a });
    expect(r.cycleDays).toBe(56);
    expect(r.cyclesPerYear).toBeCloseTo(365 / 56, 6);
    expect(r.kgSoldPerYear).toBeCloseTo(1000 * 0.95 * 1.8 * (365 / 56), 6);
    expect(r.feedKgPerYear).toBeCloseTo(r.kgSoldPerYear * 1.8, 6);
    // With feed at Rs 35 and chicks at Rs 40 (NABARD Maharashtra 2025-26) the break-even is about Rs 111 a kg:
    // above Maharashtra's Rs 95 and near what Karnataka and Tamil Nadu pay, as the 2026 project guides say.
    expect(r.breakEvenPrice).toBeGreaterThan(105);
    expect(r.breakEvenPrice).toBeLessThan(118);
  });

  it("starts the sale price at the state's own broiler rate, else at Rs 100", () => {
    const rate = (state?: string) => production.defaultAssumptions('broiler', 'independent', state).saleInrPerKg;
    expect(rate('Maharashtra')).toBe(95);
    expect(rate('Rajasthan')).toBe(76);
    expect(rate('Tamil Nadu')).toBe(127);
    expect(rate('Sikkim')).toBe(100); // no rate found for the state
    expect(rate()).toBe(100);
    // The browser starts from the same figures as the server.
    for (const state of ['Maharashtra', 'Rajasthan', 'Tamil Nadu', 'Sikkim']) {
      expect((defaultPoultryAssumptions('broiler', 'independent', state) as { saleInrPerKg: number }).saleInrPerKg).toBe(rate(state));
    }
  });

  it("starts the egg price at the state's NECC rate, else Namakkal's", () => {
    const egg = (state?: string) => production.defaultAssumptions('layer-cage', 'independent', state).eggInr;
    expect(egg('Maharashtra')).toBe(6.8);
    expect(egg('West Bengal')).toBe(7.1);
    expect(egg('Kerala')).toBe(6.2);
    expect((defaultPoultryAssumptions('layer-cage', 'independent', 'Maharashtra') as { eggInr: number }).eggInr).toBe(6.8);
  });

  it('leaves chicks, feed and medicines to the integrator under contract', () => {
    const contract = computePoultryReturns({ birdType: 'broiler', flockSize: 1000, projectCost: 400000, assumptions: defaultPoultryAssumptions('broiler', 'contract') });
    const perBatchCost = 1000 * (5.62 + 4.8);
    expect(contract.costPerCycle).toBeCloseTo(perBatchCost, 6);
    expect(contract.revenuePerCycle).toBeCloseTo(1000 * 0.95 * 1.8 * 10 + 1000 * (1.44 + 0.43), 6);
  });

  it('keeps a layer flock 20 + 52 weeks plus two weeks of cleaning, at 310 eggs a hen', () => {
    const a = defaultPoultryAssumptions('layer-cage');
    const r = computePoultryReturns({ birdType: 'layer-cage', flockSize: 1000, projectCost: 640000, assumptions: a });
    expect(r.cycleDays).toBe(518);
    expect(r.eggsPerYear).toBeCloseTo(1000 * 0.95 * 310 * (365 / 518), 6);
    expect(batchCalendar('layer-cage', a)[0]).toEqual({ batch: 1, placeDay: 0, pointOfLayDay: 140, saleDay: 504, readyDay: 518 });
  });

  it('caps the subsidy at the project cost and pays back only on a profit', () => {
    const a = { ...defaultPoultryAssumptions('desi'), subsidyInr: 50000 };
    const r = computePoultryReturns({ birdType: 'desi', flockSize: 100, projectCost: 12000, assumptions: a });
    expect(r.subsidyAmount).toBe(12000);
    expect(r.netInvestment).toBe(0);
    const losing = computePoultryReturns({ birdType: 'broiler', flockSize: 1000, projectCost: 600000, assumptions: { ...defaultPoultryAssumptions('broiler'), saleInrPerKg: 60 } });
    expect(losing.annualProfit).toBeLessThan(0);
    expect(losing.paybackYears).toBeNull();
  });

  it('starts every bird type with a full set of assumptions', () => {
    for (const bird of BIRD_TYPES) {
      const a = defaultPoultryAssumptions(bird);
      for (const [key, value] of Object.entries(a)) {
        if (key !== 'farmingModel') expect(Number.isFinite(value), `${bird} ${key}`).toBe(true);
      }
    }
  });
});

describe('poultry setup validation', () => {
  it('accepts the sample shed', () => {
    expect(validatePoultryConfig(SHED)).toEqual({});
  });

  it('refuses combinations no shed has', () => {
    expect(validatePoultryConfig({ ...SHED, housingSystem: 'backyard', frameMaterial: 'bamboo-wood' }).housingSystem).toMatch(/not kept/);
    expect(validatePoultryConfig({ ...SHED, housingSystem: 'environment-controlled' }).sideWalls).toMatch(/tunnel/);
    expect(validatePoultryConfig({ ...SHED, sideWalls: 'closed-tunnel' }).sideWalls).toMatch(/only for an environment-controlled/);
    expect(validatePoultryConfig({ ...SHED, frameMaterial: 'bamboo-wood' }).frameMaterial).toMatch(/backyard/);
    expect(validatePoultryConfig({ ...SHED, roofSheet: 'thatch' }).roofSheet).toMatch(/backyard/);
    expect(validatePoultryConfig({ ...SHED, feedingSystem: 'trough' }).feedingSystem).toMatch(/cages/);
    expect(validatePoultryConfig({ ...LAYER_SHED, feedingSystem: 'manual' }).feedingSystem).toMatch(/troughs/);
    expect(validatePoultryConfig({ ...LAYER_SHED, farmingModel: 'contract' }).farmingModel).toMatch(/meat birds/);
  });

  it('checks sizes, heights, density and location', () => {
    const errors = validatePoultryConfig({ ...SHED, width: 30, ridgeHeight: 2, stockingDensity: 0.1, cageTiers: 7, stateName: 'Atlantis' });
    expect(Object.keys(errors).sort()).toEqual(['cageTiers', 'heightLogic', 'stateName', 'stockingDensity', 'width']);
  });
});

describe('poultry calculator', () => {
  it('returns every figure for one setup', () => {
    const { result } = runPoultryCalculation({ ...SHED, state: 'Maharashtra', stateName: undefined });
    expect(result.flock).toMatchObject({ birds: 1076, product: 'meat', sqftPerBird: 1, normSqftPerBird: 1 });
    expect(result.financedCost).toBe(result.cost.projectCost);
    expect(result.schemes.schemes.map((s: { id: string; status: string }) => `${s.id}:${s.status}`)).toEqual([
      'nlm-edp-rural-poultry:not-eligible',
      'ahidf:not-eligible',
      'mh-mgpuy-poultry:check',
      'mh-mgpuy-interest:check',
    ]);
    expect(result.siting.map((rule: { id: string }) => rule.id)).toEqual(['existing-farms', 'registration']);
    expect(result.climate.heatStress.severeMonths).toEqual(['APR', 'MAY', 'JUN']);
    expect(result.calendar).toHaveLength(7);
    expect(result.diagnostics.notPriced).toEqual(['frameMaterial', 'cageTiers', 'district']);
  });

  it('honours the user stocking density and edited prices', () => {
    const { result } = runPoultryCalculation({ ...SHED, stockingDensity: 1.2 }, { chickInr: 45 });
    expect(result.flock.birds).toBe(896);
    expect(result.cost.workingCapital.chickCost).toBe(Math.round(Math.ceil(896 * 1.05) * 45));
    expect(result.assumptions.chickInr).toBe(45);
  });

  it('finances the shed alone under contract, and adds the CPCB rules above 5,000 birds', () => {
    const { result } = runPoultryCalculation({ ...SHED, length: 80, width: 7, farmingModel: 'contract' });
    expect(result.flock.birds).toBeGreaterThan(5000);
    expect(result.financedCost).toBe(result.cost.capitalCost);
    expect(result.siting.map((rule: { id: string }) => rule.id)).toContain('pollution-consent');
    expect(runPoultryCalculation({ ...SHED, length: 80, width: 7 }, {}, { bankFinanced: false }).result.siting.map((r: { id: string }) => r.id)).not.toContain('existing-farms');
  });

  it('fills in what a shed type forces before validating', () => {
    const { config } = runPoultryCalculation({ ...SHED, length: 60, width: 12, housingSystem: 'environment-controlled', feedingSystem: 'automatic' });
    expect(config.sideWalls).toBe('closed-tunnel');
    expect(runPoultryCalculation({ ...SHED, birdType: 'desi', housingSystem: 'backyard', roofSheet: 'thatch' }).config.frameMaterial).toBe('bamboo-wood');
  });

  it('suggests a narrower open shed past 12 m', () => {
    const { result } = runPoultryCalculation({ ...SHED, width: 14 });
    expect(result.climate.advisories.some((text: string) => text.includes('wider than 12 m'))).toBe(true);
  });
});

describe('poultry risk', () => {
  const setup = (over: Record<string, unknown> = {}) => {
    const { result, config } = runPoultryCalculation({ ...SHED, ...over });
    return { birdType: config.birdType, flockSize: result.flock.birds, projectCost: result.financedCost, assumptions: result.assumptions, trials: 2000 };
  };

  it('gives the same answer for the same seed and centres on the planned year', () => {
    const input = setup({ birdType: 'layer-cage', feedingSystem: 'trough', length: 40, width: 8 });
    const a = simulatePoultryRisk({ ...input, outbreakChancePct: 0 });
    expect(simulatePoultryRisk({ ...input, outbreakChancePct: 0 })).toEqual(a);
    const planned = production.computePoultryReturns({ ...input, projectCost: input.projectCost }).annualProfit;
    expect(Math.abs(a.annualProfit.p50 - planned) / Math.abs(planned)).toBeLessThan(0.15);
    expect(a.assumptions.basis).toBe('assumption');
  });

  it('takes price and feed risk off the contract farmer', () => {
    const sim = simulatePoultryRisk({ ...setup({ farmingModel: 'contract' }), outbreakChancePct: 0 });
    const range = (driver: string) => sim.drivers.find((d: { driver: string }) => d.driver === driver).range;
    expect(range('salePrice')).toBe(0);
    expect(range('feedPrice')).toBe(0);
    expect(range('mortality')).toBeGreaterThan(0);
  });

  it('loses more often when outbreaks are likelier', () => {
    const input = setup({ birdType: 'layer-cage', feedingSystem: 'trough', length: 40, width: 8 });
    const calm = simulatePoultryRisk({ ...input, outbreakChancePct: 0 });
    const risky = simulatePoultryRisk({ ...input, outbreakChancePct: 30 });
    expect(risky.npv.p50).toBeLessThan(calm.npv.p50);
    expect(risky.probabilities.outbreakYear).toBeGreaterThan(0.2);
  });
});

describe('poultry loan terms', () => {
  it('starts from the NABARD model projects', () => {
    expect(poultryLoanTerms('broiler')).toMatchObject({ loanSharePct: 75, interestPct: 12.5, tenureYears: 7, moratoriumMonths: 0 });
    expect(poultryLoanTerms('layer-cage')).toMatchObject({ loanSharePct: 75, tenureYears: 8, moratoriumMonths: 12 });
    expect(poultryLoanTerms('desi')).toMatchObject({ loanSharePct: 90, interestPct: 12, tenureYears: 5, moratoriumMonths: 0 });
    const plan = computeLoanPlan(600000, 0, { annualRevenue: 1100000, annualOperatingCost: 1000000 }, poultryLoanTerms('broiler'));
    expect(plan.loanAmount).toBe(450000);
    expect(plan.margin).toBe(150000);
  });
});

describe('poultry routes', () => {
  it('calculates a shed', async () => {
    const response = await request(app).post('/api/farm/calculate').send({ config: SHED, assumptions: { saleInrPerKg: 130 } });
    expect(response.status).toBe(200);
    expect(response.body.data.flock.birds).toBe(1076);
    expect(response.body.data.returns.annualProfit).toBeGreaterThan(0);
  });

  it('says what is wrong with a setup', async () => {
    const invalid = await request(app).post('/api/farm/calculate').send({ config: { ...SHED, sideWalls: 'closed-tunnel' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors.sideWalls).toMatch(/tunnel/);
    const malformed = await request(app).post('/api/farm/calculate').send({ config: SHED, assumptions: { mortalityPct: 140 } });
    expect(malformed.status).toBe(400);
  });

  it('simulates the risk of a shed', async () => {
    const response = await request(app).post('/api/risk/simulate').send({ config: SHED, risk: { outbreakChancePct: 5 }, options: { trials: 500 } });
    expect(response.status).toBe(200);
    expect(response.body.simulation.trials).toBe(500);
    expect(response.body.simulation.assumptions.outbreakChancePct).toBe(5);
    expect(response.body.sources.price.basis).toBe('assumption');
  });
});
