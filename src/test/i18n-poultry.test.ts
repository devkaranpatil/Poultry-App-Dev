import { describe, expect, it } from 'vitest';
import { messages } from '@/i18n/messages';
import { STEPS } from '@/components/workspace/steps';
import { DESIGN_TABS } from '@/components/farm/designTabs';
import {
  BIRD_OPTIONS,
  CATEGORY_OPTIONS,
  ENTRY_OPTIONS,
  FARMING_MODEL_OPTIONS,
  FEEDING_OPTIONS,
  FRAME_OPTIONS,
  HOUSING_OPTIONS,
  ROOF_OPTIONS,
  ROOF_SHEET_OPTIONS,
  SIDE_WALL_OPTIONS,
  optionKey,
} from '@/types/farm';
import { RISK_DRIVERS } from '@/services/risk.service';
import { defaultPoultryAssumptions } from '@/lib/poultryFinance';
import { BIOSECURITY_KEYS } from '@/lib/export/reportData';

const en = messages.en;
const values = (options: ReadonlyArray<{ value: string }>) => options.map((option) => option.value);

/** Every key the poultry screens build at run time, which a search of the code cannot find. */
function dynamicKeys(): string[] {
  const groups: Array<[string, readonly string[]]> = [
    ['housing', values(HOUSING_OPTIONS)],
    ['roof', values(ROOF_OPTIONS)],
    ['frame', values(FRAME_OPTIONS)],
    ['roofSheet', values(ROOF_SHEET_OPTIONS)],
    ['sideWalls', values(SIDE_WALL_OPTIONS)],
    ['entry', values(ENTRY_OPTIONS)],
    ['bird', values(BIRD_OPTIONS)],
    ['feeding', values(FEEDING_OPTIONS)],
    ['farming', values(FARMING_MODEL_OPTIONS)],
    ['category', values(CATEGORY_OPTIONS)],
  ];
  const hinted = ['housing', 'roof', 'frame', 'roofSheet', 'sideWalls', 'entry', 'feeding'];
  const assumptionFields = new Set(
    (['broiler', 'layer-cage', 'desi'] as const).flatMap((bird) => Object.keys(defaultPoultryAssumptions(bird))).filter((field) => field !== 'farmingModel')
  );
  return [
    ...groups.flatMap(([group, options]) => options.map((value) => optionKey(group, value))),
    ...groups.filter(([group]) => hinted.includes(group)).flatMap(([group, options]) => options.map((value) => optionKey(`${group}Hint`, value))),
    ...DESIGN_TABS.flatMap((tab) => [`design.tab.${tab}`, `design.help.${tab}`]),
    ...STEPS.flatMap((step) => [`ws.steps.${step}`, `ws.question.${step}`]),
    ...RISK_DRIVERS.flatMap((driver) => [`risk.driver.${driver}`, `risk.driverTip.${driver}`]),
    ...['eligible', 'check', 'not-eligible'].map((status) => `schemes.status.${status}`),
    ...['new-farms', 'all-farms', 'bank-financed-farms'].map((rule) => `siting.appliesTo.${rule}`),
    ...['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((month) => `month.${month}`),
    ...['meat', 'contract', 'eggs'].map((kind) => `returns.assumptionsHint.${kind}`),
    ...['independent', 'contract'].map((model) => `design.farmingHint.${model}`),
    ...['structure', 'birds', 'climate', 'cost', 'operations'].map((category) => `ai.category.${category}`),
    ...['saleInrPerKg', 'growingChargeInrPerKg', 'eggInr', ...assumptionFields].map((field) => `assumption.${field}`),
    ...BIOSECURITY_KEYS,
  ];
}

describe('poultry wording', () => {
  it('has an English text for every key the screens build at run time', () => {
    const missing = [...new Set(dynamicKeys())].filter((key) => !en[key]);
    expect(missing).toEqual([]);
  });

  it('gives the main poultry words in Hindi and Marathi', () => {
    for (const key of ['design.tab.birds', 'options.bird.broiler', 'heat.title', 'siting.title', 'schemes.none', 'ws.question.site']) {
      expect(messages.hi[key], key).not.toBe(en[key]);
      expect(messages.mr[key], key).not.toBe(en[key]);
    }
    // Marathi falls back to Hindi, so it needs its own words where the languages differ.
    expect(messages.mr['heat.title']).not.toBe(messages.hi['heat.title']);
  });

  it('no longer talks about polyhouses outside the 3D scene, which Phase 5 rebuilds', () => {
    const legacy = /^(edit\.|viewport\.|middle\.|scene\.|options\.(greenhouse|structure|cover|sideVent|door|crop|irrigation)\.|options\.roof\.(flat|gothic)|left\.gutter|term\.gutter|validation\.flatRidge)/;
    const offending = Object.entries(en)
      .filter(([key]) => !legacy.test(key))
      .filter(([, value]) => /polyhouse|greenhouse|MIDH|\bNHB\b|irrigation|\bcrops?\b/i.test(value))
      .map(([key]) => key);
    expect(offending).toEqual([]);
  });
});
