/** @vitest-environment node */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import norms from '../../shared/poultry-norms.json';
import { floorAreaFor, flockSize, sqftPerBird } from '@/lib/flock';
import { BIRD_TYPES, DEFAULT_POULTRY_CONFIG, HOUSING_SYSTEMS, type BirdType, type HousingSystem } from '@/types/poultry';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../../backend/scripts/loadReferenceData');
const backendFlock = require('../../backend/services/flock');
const { SCHEMES, computeSchemes } = require('../../backend/data/poultry/schemes');
const { SITING_RULES, sitingRulesFor } = require('../../backend/data/poultry/siting');

type Row = Record<string, string>;
const csv = (file: string): Row[] => parseCsv(fs.readFileSync(path.join(__dirname, '../../datasets/csv', file), 'utf8'));
const num = (value: string) => (value === '' ? null : Number(value));

type BirdNorms = {
  housing: string[];
  sqftPerBird: Record<string, number>;
  sqftPerBirdSources: Record<string, string>;
  sources: Record<string, string>;
  rearingDays?: number;
  cleaningDays?: number;
  mortalityPct?: number;
  saleWeightKg?: number;
  feedKgPerBird?: number;
  growerWeeks?: number;
  layingWeeks?: number;
  eggsPerHen?: number;
  layingMortalityPct?: number;
  fcr?: number;
};
const birds = norms.birdTypes as Record<string, BirdNorms>;

describe('poultry norms', () => {
  it('names a known source for every figure', () => {
    const known = new Set(Object.keys(norms.sources));
    for (const [id, bird] of Object.entries(birds)) {
      for (const sourceId of [...Object.values(bird.sources), ...Object.values(bird.sqftPerBirdSources)]) {
        expect(known, `${id}: ${sourceId}`).toContain(sourceId);
      }
    }
    const priced = Object.values(norms.prices).flat() as Array<{ source: string }>;
    type Sourced = { source: string };
    const costEntries = Object.values(norms.costs as Record<string, Sourced | Record<string, Sourced>>);
    const costed = costEntries.flatMap((entry): Sourced[] => ('source' in entry ? [entry as Sourced] : Object.values(entry as Record<string, Sourced>)));
    for (const { source } of [...priced, ...costed]) expect(known, source).toContain(source);
  });

  it('names a known source for every planning default and every state price, for states the planner knows', () => {
    const known = new Set(Object.keys(norms.sources));
    type Default = { value: number; source: string; byState?: Record<string, number>; byStateSource?: string };
    const defaults = norms.planningDefaults as unknown as { meat: Record<string, Record<string, Default>>; layer: Record<string, Default> };
    const entries = [...Object.values(defaults.meat).flatMap((family) => Object.values(family)), ...Object.values(defaults.layer)];
    const stateClimate = require('../../backend/data/stateClimate.js') as Record<string, unknown>;
    for (const entry of entries) {
      expect(known, entry.source).toContain(entry.source);
      expect(entry.value).toBeGreaterThan(0);
      if (!entry.byState) continue;
      expect(known, `state rates: ${entry.byStateSource}`).toContain(entry.byStateSource);
      for (const [state, price] of Object.entries(entry.byState)) {
        expect(Object.keys(stateClimate), state).toContain(state);
        expect(price, state).toBeGreaterThan(0);
      }
    }
  });

  it('gives floor space for exactly the sheds each bird can live in', () => {
    for (const [id, bird] of Object.entries(birds)) {
      expect(Object.keys(bird.sqftPerBird).sort(), id).toEqual([...bird.housing].sort());
      for (const housing of bird.housing) expect(HOUSING_SYSTEMS, `${id} in ${housing}`).toContain(housing);
    }
  });

  it('matches the production norms published in datasets/csv', () => {
    const rows = csv('poultry_production_norms.csv');
    const pairs = Object.entries(birds).flatMap(([id, bird]) => bird.housing.map((housing) => `${id}|${housing}`));
    expect(rows.map((row) => `${row.bird_type}|${row.housing}`).sort()).toEqual(pairs.sort());
    for (const row of rows) {
      const bird = birds[row.bird_type];
      expect(num(row.sqft_per_bird), `${row.bird_type} ${row.housing}`).toBe(bird.sqftPerBird[row.housing]);
      expect(num(row.rearing_days)).toBe(bird.rearingDays ?? null);
      expect(num(row.cleaning_days)).toBe(bird.cleaningDays ?? null);
      expect(num(row.mortality_pct)).toBe(bird.mortalityPct ?? null);
      expect(num(row.sale_weight_kg)).toBe(bird.saleWeightKg ?? null);
      expect(num(row.feed_kg_per_bird)).toBe(bird.feedKgPerBird ?? null);
      expect(num(row.grower_weeks)).toBe(bird.growerWeeks ?? null);
      expect(num(row.laying_weeks)).toBe(bird.layingWeeks ?? null);
      expect(num(row.eggs_per_hen)).toBe(bird.eggsPerHen ?? null);
      expect(num(row.laying_mortality_pct)).toBe(bird.layingMortalityPct ?? null);
      expect(num(row.fcr)).toBe(bird.fcr ?? null);
    }
  });

  it('matches the NABARD unit costs it quotes', () => {
    const rows = csv('nabard_poultry_unit_costs.csv');
    const unit = (bird: string, size: number) => rows.find((row) => row.bird_type === bird && Number(row.birds) === size);
    expect(Number(unit('broiler', 1000)?.unit_cost_inr)).toBe(594000);
    expect(Number(unit('layer-cage', 5000)?.unit_cost_inr)).toBe(3210000);
    expect(unit('broiler', 500)?.notes).toContain(`Rs ${norms.costs.shedInrPerSqft.broiler.value}/sq ft`);
    expect(unit('layer-cage', 5000)?.notes).toContain(`Rs ${norms.costs.equipmentInrPerBird.layerCage.value}/bird`);
  });
});

describe('flock size', () => {
  it('is floor area over the space each bird needs', () => {
    // 10 m x 10 m = 1,076.39 sq ft: 1,076 broilers at 1 sq ft, 538 floor layers at 2 sq ft.
    expect(flockSize({ length: 10, width: 10, birdType: 'broiler', housing: 'open-sided' })).toBe(1076);
    expect(flockSize({ length: 10, width: 10, birdType: 'layer-floor', housing: 'open-sided' })).toBe(538);
    expect(flockSize({ length: 10, width: 10, birdType: 'broiler', housing: 'environment-controlled' })).toBe(1537);
  });

  it('has no answer for a bird in a shed the sources do not describe', () => {
    expect(sqftPerBird('broiler', 'backyard')).toBeNull();
    expect(flockSize({ length: 10, width: 10, birdType: 'broiler', housing: 'backyard' })).toBeNull();
  });

  it('turns a flock back into the floor it needs', () => {
    const area = floorAreaFor({ birds: 5000, birdType: 'broiler', housing: 'open-sided' }) as number;
    expect(area).toBeCloseTo(464.5, 1);
    expect(flockSize({ length: area, width: 1, birdType: 'broiler', housing: 'open-sided' })).toBe(5000);
  });

  it('gives the same answer in the browser and on the server', () => {
    for (const birdType of BIRD_TYPES as BirdType[]) {
      for (const housing of HOUSING_SYSTEMS as HousingSystem[]) {
        for (const [length, width] of [[14, 7], [60, 12], [3.3, 2.1]]) {
          const shed = { length, width, birdType, housing };
          expect(backendFlock.flockSize(shed), `${birdType} ${housing} ${length}x${width}`).toBe(flockSize(shed));
        }
        const flock = { birds: 2500, birdType, housing };
        expect(backendFlock.floorAreaFor(flock)).toBe(floorAreaFor(flock));
      }
    }
  });

  it("starts from a shed near NABARD's 1,000-bird broiler unit", () => {
    const housed = flockSize({ ...DEFAULT_POULTRY_CONFIG, housing: DEFAULT_POULTRY_CONFIG.housingSystem });
    expect(housed).toBeGreaterThanOrEqual(1000);
    expect(housed).toBeLessThan(1100);
  });
});

describe('schemes', () => {
  const byId = (result: { schemes: Array<{ id: string }> }, id: string) => result.schemes.find((scheme) => scheme.id === id) as Record<string, unknown>;

  it('gives a rural Low Input Technology parent farm NLM support, capped at Rs 25 lakh', () => {
    const result = computeSchemes({
      birdType: 'desi',
      state: 'Odisha',
      capitalCostInr: 8_000_000,
      lowInputBreed: true,
      hasHatchery: true,
      parentFemales: 1000,
      parentMales: 100,
      greenfield: true,
    });
    expect(byId(result, 'nlm-edp-rural-poultry')).toMatchObject({ status: 'eligible', percent: 50, amountInr: 2_500_000, cappedAtInr: 2_500_000 });
    expect(result.noneApplies).toBe(false);
  });

  it('pays half the cost below the cap', () => {
    const nlm = byId(
      computeSchemes({ birdType: 'desi', state: 'Odisha', capitalCostInr: 3_000_000, lowInputBreed: true, hasHatchery: true, parentFemales: 1200, parentMales: 120 }),
      'nlm-edp-rural-poultry'
    );
    expect(nlm).toMatchObject({ status: 'eligible', amountInr: 1_500_000, cappedAtInr: null });
  });

  it('asks to confirm what it cannot know, rather than promising the subsidy', () => {
    const nlm = byId(computeSchemes({ birdType: 'layer-cage', state: 'Odisha', capitalCostInr: 3_000_000 }), 'nlm-edp-rural-poultry');
    expect(nlm.status).toBe('check');
    expect((nlm.reasons as string[]).length).toBe(3);
  });

  it('says plainly when nothing applies to a commercial broiler farm outside Maharashtra', () => {
    const result = computeSchemes({ birdType: 'broiler', state: 'Punjab', capitalCostInr: 3_000_000 });
    expect(byId(result, 'nlm-edp-rural-poultry')).toMatchObject({ status: 'not-eligible', amountInr: 0 });
    expect(byId(result, 'ahidf')).toMatchObject({ status: 'not-eligible' });
    expect(result).toMatchObject({ noneApplies: true, bestAmountInr: 0 });
  });

  it('turns NLM down for too few parent birds or an expansion', () => {
    const base = { birdType: 'desi', state: 'Odisha', capitalCostInr: 3_000_000, lowInputBreed: true, hasHatchery: true };
    expect(byId(computeSchemes({ ...base, parentFemales: 500, parentMales: 100 }), 'nlm-edp-rural-poultry').status).toBe('not-eligible');
    expect(byId(computeSchemes({ ...base, parentFemales: 1000, parentMales: 100, greenfield: false }), 'nlm-edp-rural-poultry').status).toBe('not-eligible');
  });

  it('offers AHIDF only with a feed plant or processing unit', () => {
    const result = computeSchemes({ birdType: 'broiler', state: 'Punjab', capitalCostInr: 3_000_000, includesFeedOrProcessing: true });
    expect(byId(result, 'ahidf')).toMatchObject({ status: 'eligible', interestSubventionPct: 3 });
  });

  it("shows Maharashtra's scheme there only, as the GR sets it: 75% for SC/ST, up to the unit's fixed project cost", () => {
    const mh = byId(computeSchemes({ birdType: 'broiler', state: 'Maharashtra', category: 'sc-st', capitalCostInr: 2_000_000, flockSize: 5000 }), 'mh-mgpuy-poultry');
    // 75% of the GR's Rs 19,00,000 unit is Rs 14,25,000, below 75% of this project's Rs 20,00,000.
    expect(mh).toMatchObject({ status: 'check', percent: 75, capInr: 1_425_000, amountInr: 1_425_000, cappedAtInr: 1_425_000, verified: true });
    expect(byId(computeSchemes({ birdType: 'broiler', state: 'Gujarat', capitalCostInr: 2_000_000 }), 'mh-mgpuy-poultry')).toBeUndefined();
  });

  it("pays Maharashtra's share of the project cost when that is below the unit's, and picks the unit by flock and kind", () => {
    const small = byId(computeSchemes({ birdType: 'desi', state: 'Maharashtra', capitalCostInr: 1_000_000, flockSize: 3000 }), 'mh-mgpuy-poultry');
    expect(small).toMatchObject({ percent: 50, capInr: 600_000, amountInr: 500_000, cappedAtInr: null }); // 50% of Rs 12,00,000 is the cap
    const layers = byId(computeSchemes({ birdType: 'layer-cage', state: 'Maharashtra', category: 'sc-st', capitalCostInr: 5_000_000, flockSize: 5000 }), 'mh-mgpuy-poultry');
    expect(layers).toMatchObject({ capInr: 2_250_000, amountInr: 2_250_000 }); // 75% of Rs 30,00,000
    expect((layers.reasons as string[]).join(' ')).toMatch(/5,000 desi or improved layers/);
    const broiler = byId(computeSchemes({ birdType: 'broiler', state: 'Maharashtra', capitalCostInr: 2_000_000, flockSize: 5000 }), 'mh-mgpuy-poultry');
    expect((broiler.reasons as string[]).join(' ')).toMatch(/commercial broiler/);
  });

  it('matches the scheme rules published in datasets/csv', () => {
    const rows = csv('poultry_scheme_rules.csv');
    expect(rows.map((row) => row.scheme_id).sort()).toEqual(Object.keys(SCHEMES).sort());
    for (const row of rows) {
      const rule = SCHEMES[row.scheme_id];
      expect(row.verified, row.scheme_id).toBe(String(rule.verified));
      expect(row.source_url).toBe(rule.source.url);
      expect(num(row.cap_inr)).toBe(rule.capInr ?? null);
      expect(num(row.percent_general)).toBe(rule.percent?.general ?? null);
      expect(num(row.percent_sc_st)).toBe(rule.percent?.['sc-st'] ?? null);
      expect(num(row.min_own_contribution_pct)).toBe(rule.minOwnContributionPct ?? null);
      expect(row.state).toBe(rule.state ?? '');
    }
  });
});

describe('siting rules', () => {
  const ids = (birdCount: number, options?: object) => sitingRulesFor(birdCount, options).map((rule: { id: string }) => rule.id);

  it('apply the CPCB distances and pollution consent only above 5,000 birds', () => {
    expect(ids(5000)).toEqual(['existing-farms', 'registration']);
    expect(ids(5001)).toContain('residential');
    expect(ids(5001)).toContain('pollution-consent');
    expect(ids(5001)).toHaveLength(SITING_RULES.length);
  });

  it("drop NABARD's 1 km rule for a farm without a bank loan", () => {
    expect(ids(1000, { bankFinanced: false })).toEqual(['registration']);
    expect(ids(0)).toEqual([]);
  });

  it('match the rules published in datasets/csv', () => {
    const rows = csv('poultry_siting_rules.csv');
    expect(rows.map((row) => row.rule_id)).toEqual(SITING_RULES.map((rule: { id: string }) => rule.id));
    for (const row of rows) {
      const rule = SITING_RULES.find((entry: { id: string }) => entry.id === row.rule_id);
      expect(num(row.distance_m), row.rule_id).toBe(rule.distanceM);
      expect(Number(row.applies_above_birds)).toBe(rule.appliesAboveBirds);
      expect(row.applies_to).toBe(rule.appliesTo);
      expect(row.description).toBe(rule.description);
      expect(row.source_url).toBe(rule.source.url);
    }
  });
});
