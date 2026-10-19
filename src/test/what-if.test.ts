/** @vitest-environment node */
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { computeFinancials } from '@/lib/finance';

const require = createRequire(import.meta.url);
const whatIf = require('../../backend/services/whatIf');
const { computeReturns } = require('../../backend/services/returns');
const { runCalculation } = require('../../backend/routes/greenhouse');

// The Goa benchmark as the browser sends it (toGreenhousePayload: stateName and doorType).
const goa = {
  length: 30, width: 10, gutterHeight: 4, ridgeHeight: 6, greenhouseType: 'naturally-ventilated', roofType: 'gable',
  structureMaterial: 'gi-steel', coverMaterial: 'uv-polyfilm', sideVentilation: 'manual-rollup', doorType: 'single-sliding',
  selectedCrop: 'tomato', irrigationSystem: 'drip', stateName: 'Goa', district: 'North Goa',
};
const financials = { subsidyPct: 50, yieldPerSqm: 8.75, pricePerUnit: 30, operatingCostPct: 40 };
// What the model returns when a question changes nothing: every field present, "unchanged" or null.
const nothing = Object.fromEntries(
  Object.entries(whatIf.WHAT_IF_SCHEMA.properties).map(([key, value]) => [key, (value as { enum?: string[] }).enum ? 'unchanged' : null])
);
const plan = (extracted: object) => whatIf.planScenario({ rawConfig: goa, financials, extracted: { ...nothing, isWhatIf: true, ...extracted }, runCalculation });

describe('spotting a what-if question', () => {
  it.each([
    ['What if I build 500 m2 of fan and pad?', true],
    ['How much more would it cost in bamboo?', true],
    ['Suppose the price is Rs 40 a kilo', true],
    ['अगर मैं खीरा लगाऊं तो?', true],
    ['What temperature does capsicum need?', false],
    ['What is the area limit per beneficiary?', false],
  ])('%s -> %s', (question, expected) => {
    expect(whatIf.looksLikeWhatIf(question)).toBe(expected);
  });
});

describe('planning a what-if', () => {
  it('recalculates cost, MIDH 2025 subsidy and returns for a bigger fan-and-pad house', () => {
    const result = plan({ greenhouseType: 'climate-controlled', areaSqm: 500 });
    expect(result.changes.map((change: { field: string }) => change.field)).toEqual(['greenhouseType', 'size']);
    expect(result.baseline).toMatchObject({ areaSqm: 300, totalCostInr: 495338, subsidyInr: 180000, netInvestmentInr: 315338, paybackYears: 7.9 });
    // 38.5 x 13 m keeps the proportions; fan and pad between 500 and 1,008 m2 is Rs 1,600 per m2 (MIDH 2025).
    expect(result.scenario).toMatchObject({ areaSqm: 500.5, subsidyInr: 400400, subsidyScheme: 'NHM' });
    expect(result.scenario.totalCostInr).toBeGreaterThan(result.baseline.totalCostInr);
  });

  it('applies a new price to the returns only', () => {
    const result = plan({ pricePerUnit: 40 });
    expect(result.scenario.totalCostInr).toBe(result.baseline.totalCostInr);
    expect(result.scenario.annualProfitInr).toBe(Math.round(300 * 0.85 * 8.75 * 40 * 0.6));
  });

  it('does not compare profit when the crop changes without a yield and price', () => {
    const result = plan({ selectedCrop: 'capsicum' });
    expect(result.scenario.annualProfitInr).toBeNull();
    expect(result.scenario.netInvestmentInr).toBe(315338); // the build is the same
    expect(result.note).toMatch(/yield and price/);
  });

  it('passes on the planner message when the change is not buildable', () => {
    const result = plan({ lengthM: 5000 });
    expect(result.error).toMatch(/Length must be between/);
    expect(whatIf.scenarioBlock(result)).toMatch(/cannot calculate/);
  });

  it('returns nothing for a question that is not a what-if or changes nothing', () => {
    expect(whatIf.planScenario({ rawConfig: goa, financials, extracted: { ...nothing, isWhatIf: false }, runCalculation })).toBeNull();
    expect(plan({})).toBeNull();
  });

  it('moves to the new state and drops the old district', () => {
    const { config } = whatIf.applyChanges(goa, { ...nothing, state: 'Punjab' });
    expect(config).toMatchObject({ stateName: 'Punjab', district: '' });
  });

  it('writes a prompt block with the figures in rupees', () => {
    const block = whatIf.scenarioBlock(plan({ greenhouseType: 'climate-controlled', areaSqm: 500 }));
    expect(block).toMatch(/quote these figures exactly/);
    expect(block).toMatch(/Subsidy: now Rs 1,80,000 \(NHM\); with the change Rs 4,00,400 \(NHM\)/);
  });
});

describe("keeping only what the question asks (the model's extra fields are dropped)", () => {
  // The readings Qwen3-4B actually produced in the evaluation of 14 Oct 2026.
  const noisyBamboo = {
    ...nothing, isWhatIf: true, greenhouseType: 'climate-controlled', roofType: 'flat', structureMaterial: 'bamboo',
    coverMaterial: 'glass', state: 'Goa', yieldPerSqm: 8.75, pricePerUnit: 30, subsidyPct: 50, operatingCostPct: 40,
  };
  const noisyFanPad = { ...nothing, isWhatIf: true, roofType: 'flat', state: 'Goa', areaSqm: 500, yieldPerSqm: 8.75, pricePerUnit: 30 };
  const planFor = (extracted: object, question: string) =>
    whatIf.planScenario({ rawConfig: goa, financials, extracted, question, runCalculation });

  it('turns "switch to bamboo" into the bamboo change only', () => {
    const result = planFor(noisyBamboo, 'How much would it cost if I switch to a bamboo structure?');
    expect(result.changes).toEqual([{ field: 'structureMaterial', from: 'gi-steel', to: 'bamboo' }]);
    expect(result.scenario).toMatchObject({ totalCostInr: 318150, subsidyInr: 67500 });
  });

  it('adds the fan and pad change the model missed and drops the flat roof it invented', () => {
    const result = planFor(noisyFanPad, 'What if I build 500 square metres of fan and pad instead?');
    expect(result.changes.map((change: { field: string }) => change.field)).toEqual(['greenhouseType', 'size']);
    expect(result.scenario).toMatchObject({ areaSqm: 500.5, totalCostInr: 1162201, subsidyInr: 400400 });
  });

  it('keeps a number only when the question contains it', () => {
    const grounded = whatIf.groundExtraction({ ...nothing, isWhatIf: true, areaSqm: 600, pricePerUnit: 40 }, 'What if the price is Rs 40 per kg?');
    expect(grounded).toMatchObject({ areaSqm: null, pricePerUnit: 40 });
  });

  it('reads Devanagari digits', () => {
    const grounded = whatIf.groundExtraction({ ...nothing, isWhatIf: true, pricePerUnit: 40 }, 'अगर भाव ४० रुपये किलो हो तो?');
    expect(grounded.pricePerUnit).toBe(40);
  });

  it('keeps the crop the model chose when the question names two', () => {
    const grounded = whatIf.groundExtraction({ ...nothing, isWhatIf: true, selectedCrop: 'capsicum' }, 'What if I grow capsicum instead of tomato?');
    expect(grounded.selectedCrop).toBe('capsicum');
  });
});

describe('backend returns match the returns panel', () => {
  it('gives the same figures as src/lib/finance.ts for many inputs', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i += 1) {
      const capitalCost = 100_000 + random() * 40_000_000;
      const areaSqm = 50 + random() * 20_000;
      const scheme = random() < 0.3 ? null : { eligibleCostInr: capitalCost * random(), capInr: random() < 0.5 ? null : 5_600_000 };
      const assumptions = { subsidyPct: random() * 100, yieldPerSqm: random() * 300, pricePerUnit: random() * 200, operatingCostPct: random() * 100 };
      const frontend = computeFinancials(capitalCost, areaSqm, assumptions, scheme);
      const backend = computeReturns({ capitalCost, areaSqm, scheme, ...assumptions });
      for (const key of ['subsidyAmount', 'netInvestment', 'annualRevenue', 'annualProfit'] as const) {
        expect(backend[key]).toBeCloseTo(frontend[key], 6);
      }
      expect(backend.paybackYears === null).toBe(frontend.paybackYears === null);
    }
  });
});
