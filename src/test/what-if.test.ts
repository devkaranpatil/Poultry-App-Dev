/** @vitest-environment node */
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const whatIf = require('../../backend/services/whatIf');
const { runCalculation } = require('../../backend/routes/farm');

// A 1,076-bird open broiler shed in Nagpur, as the browser sends it.
const shed = {
  length: 20, width: 5, eavesHeight: 2.1, ridgeHeight: 3.5, housingSystem: 'open-sided', roofType: 'gable',
  frameMaterial: 'steel-truss', roofSheet: 'gi-sheet', sideWalls: 'mesh-curtain', entry: 'door-footbath',
  birdType: 'broiler', feedingSystem: 'manual', farmingModel: 'independent', stateName: 'Maharashtra', district: 'Nagpur',
};
const assumptions = { saleInrPerKg: 110 };
// What the model returns when a question changes nothing: every field present, "unchanged" or null.
const nothing = Object.fromEntries(
  Object.entries(whatIf.WHAT_IF_SCHEMA.properties).map(([key, value]) => [key, (value as { enum?: string[] }).enum ? 'unchanged' : null])
);
const plan = (extracted: object, question?: string) =>
  whatIf.planScenario({ rawConfig: shed, assumptions, extracted: { ...nothing, isWhatIf: true, ...extracted }, question, runCalculation });
const fields = (result: { changes: Array<{ field: string }> }) => result.changes.map((change) => change.field);

describe('spotting a what-if question', () => {
  it.each([
    ['What if I keep 5,000 broilers?', true],
    ['How much more would a controlled shed cost?', true],
    ['Suppose the price is Rs 110 a kilo', true],
    ['How much would the shed cost with a PUF panel roof?', true],
    ['अगर मैं लेयर रखूं तो?', true],
    ['What temperature do chicks need in the first week?', false],
    ['When should broilers be vaccinated against Ranikhet?', false],
  ])('%s -> %s', (question, expected) => {
    expect(whatIf.looksLikeWhatIf(question)).toBe(expected);
  });
});

describe('planning a what-if', () => {
  it('lengthens the shed to hold the flock asked for, at its stocking density', () => {
    const result = plan({ birds: 5000 });
    expect(fields(result)).toEqual(['size']);
    expect(result.changes[0]).toEqual({ field: 'size', from: '20 x 5 m', to: '93 x 5 m' });
    expect(result.baseline.birds).toBe(1076);
    expect(result.scenario.birds).toBe(5005);
    expect(result.scenario.capitalCostInr).toBeGreaterThan(result.baseline.capitalCostInr * 4);
    expect(result.note).toBe('5,000 birds were asked for; the shed made for them (93 x 5 m) holds 5,005. Give both numbers.');
    expect(whatIf.scenarioBlock(result)).toContain('holds 5,005');
  });

  it('applies a new price to the returns only', () => {
    const result = plan({ saleInrPerKg: 120 });
    expect(result.changes).toEqual([{ field: 'saleInrPerKg', from: 110, to: 120 }]);
    expect(result.scenario.capitalCostInr).toBe(result.baseline.capitalCostInr);
    expect(result.scenario.annualProfitInr).toBeGreaterThan(result.baseline.annualProfitInr);
  });

  it('starts from the defaults of a new farming model and finances the shed alone under contract', () => {
    const result = plan({ farmingModel: 'contract' });
    expect(fields(result)).toEqual(['farmingModel']);
    expect(result.note).toMatch(/defaults/);
    expect(result.scenario.financedCostInr).toBe(result.scenario.capitalCostInr);
    expect(result.scenario.breakEvenPrice).toBeLessThan(10); // a growing charge, not a live-bird price
  });

  it('keeps a layer shed valid: troughs for cages and no contract', () => {
    const result = plan({ birdType: 'layer-cage' });
    expect(result.error).toBeUndefined();
    expect(result.scenario.product).toBe('eggs');
    expect(whatIf.applyChanges(shed, { ...nothing, birdType: 'layer-cage' }).config.feedingSystem).toBe('trough');
  });

  it('closes the walls of a controlled shed and fits a backyard shed with a bamboo frame', () => {
    expect(whatIf.applyChanges(shed, { ...nothing, housingSystem: 'environment-controlled' }).config.sideWalls).toBe('closed-tunnel');
    const backyard = whatIf.applyChanges({ ...shed, birdType: 'desi' }, { ...nothing, housingSystem: 'backyard' }).config;
    expect(backyard.frameMaterial).toBe('bamboo-wood');
  });

  it('passes on the planner message when the change is not buildable', () => {
    const result = plan({ housingSystem: 'backyard' });
    expect(result.error).toMatch(/not kept/);
  });

  it('returns nothing for a question that is not a what-if or changes nothing', () => {
    expect(whatIf.planScenario({ rawConfig: shed, assumptions, extracted: { ...nothing, isWhatIf: false }, runCalculation })).toBeNull();
    expect(plan({ saleInrPerKg: 110 })).toBeNull();
  });

  it('moves to the new state and drops the old district', () => {
    const result = plan({ state: 'Punjab' });
    expect(result.changes).toEqual([{ field: 'state', from: 'Maharashtra', to: 'Punjab' }]);
  });

  it("follows the new state's sale price unless the user set their own", () => {
    const production = require('../../backend/services/poultry/production');
    const own = production.defaultAssumptions('broiler', 'independent', 'Maharashtra');
    const moved = whatIf.planScenario({ rawConfig: shed, assumptions: own, extracted: { ...nothing, isWhatIf: true, state: 'Punjab' }, runCalculation });
    expect(moved.changes).toEqual([
      { field: 'state', from: 'Maharashtra', to: 'Punjab' },
      { field: 'saleInrPerKg', from: 95, to: 99 },
    ]);
    // Rs 110 is the user's own figure (the default here is Rs 95), so it stays.
    expect(plan({ state: 'Punjab' }).changes).toEqual([{ field: 'state', from: 'Maharashtra', to: 'Punjab' }]);
  });

  it('writes a prompt block with the figures in rupees', () => {
    const block = whatIf.scenarioBlock(plan({ saleInrPerKg: 120 }));
    expect(block).toContain('PLANNER WHAT-IF');
    expect(block).toMatch(/Break-even price: Rs [\d.]+ per kg/);
  });

  it('lists the figures with the change first, apart from the figures now', () => {
    const result = plan({ saleInrPerKg: 120 });
    const block = whatIf.scenarioBlock(result);
    const withChange = block.indexOf('WITH THE CHANGE:');
    const now = block.indexOf('NOW (the project as it is):');
    expect(withChange).toBeGreaterThan(-1);
    expect(now).toBeGreaterThan(withChange);
    const profit = (value: number) => `Yearly profit: Rs ${value.toLocaleString('en-IN')}`;
    expect(block.slice(withChange, now)).toContain(profit(result.scenario.annualProfitInr));
    expect(block.slice(now)).toContain(profit(result.baseline.annualProfitInr));
  });

  it('gives the planner limit for a shed 10 km long', () => {
    for (const lengthM of [10000, 10]) {
      const result = plan({ lengthM }, 'What if I make the shed 10 km long?');
      expect(result).toEqual({ changes: [{ field: 'size', from: '20 x 5 m', to: '10000 x 5 m' }], error: 'Length must be between 2 and 150 m' });
    }
  });
});

describe("keeping only what the question asks (the model's extra fields are dropped)", () => {
  it('turns "on contract" into the farming model change only', () => {
    const noisy = { ...nothing, isWhatIf: true, farmingModel: 'contract', housingSystem: 'environment-controlled', roofSheet: 'puf-panel', saleInrPerKg: 110 };
    const result = whatIf.planScenario({ rawConfig: shed, assumptions, extracted: noisy, question: 'What if I farm on contract with an integrator?', runCalculation });
    expect(fields(result)).toEqual(['farmingModel']);
  });

  it('adds the bird the model missed', () => {
    const grounded = whatIf.groundExtraction({ ...nothing, isWhatIf: true }, 'What if I keep Kadaknath birds instead?');
    expect(grounded.birdType).toBe('desi');
  });

  it('tells cage layers from floor layers', () => {
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true }, 'What if I keep layers in cages?').birdType).toBe('layer-cage');
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true }, 'What if I keep layers on deep litter?').birdType).toBe('layer-floor');
  });

  it('keeps a number only when the question contains it', () => {
    const grounded = whatIf.groundExtraction({ ...nothing, isWhatIf: true, birds: 6000, saleInrPerKg: 120 }, 'What if the price is Rs 120 per kg?');
    expect(grounded).toMatchObject({ birds: null, saleInrPerKg: 120 });
  });

  it('reads Devanagari digits and Indian thousands', () => {
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true, saleInrPerKg: 120 }, 'अगर भाव १२० रुपये किलो हो तो?').saleInrPerKg).toBe(120);
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true, birds: 5000 }, 'What if I keep 5,000 birds?').birds).toBe(5000);
  });

  it('reads a size given in km or feet as metres', () => {
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true, lengthM: 10000 }, 'What if I make the shed 10 km long?').lengthM).toBe(10000);
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true, widthM: 30 }, 'What if the shed is 30 feet wide?').widthM).toBe(9.14);
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true, areaSqm: 2000 }, 'What if the floor is 2,000 sq ft?').areaSqm).toBe(185.81);
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true, lengthM: 300 }, 'What if I make the shed 10 km long?').lengthM).toBeNull();
  });

  it('does not mistake semi-automatic feeders for automatic ones', () => {
    expect(whatIf.groundExtraction({ ...nothing, isWhatIf: true }, 'What if I fit semi-automatic pan feeders?').feedingSystem).toBe('semi-auto');
  });
});
