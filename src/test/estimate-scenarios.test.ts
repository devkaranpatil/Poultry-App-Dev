import { describe, expect, it } from 'vitest';
import { defaultPoultryAssumptions } from '@/lib/poultryFinance';
import { scenarioAssumptions, KEY_FIELDS } from '@/lib/estimateScenarios';

describe('estimate scenarios', () => {
  it('lowers the sale price and raises feed and mortality in the downside case', () => {
    const base = defaultPoultryAssumptions('broiler', 'independent', 'Maharashtra') as unknown as Record<string, number>;
    const down = scenarioAssumptions(base as never, 'broiler', 'downside') as Record<string, number>;
    expect(down.saleInrPerKg).toBeCloseTo(base.saleInrPerKg * 0.85, 1);
    expect(down.feedInrPerKg).toBeGreaterThan(base.feedInrPerKg);
    expect(down.mortalityPct).toBe(base.mortalityPct + 2);
  });

  it('never takes mortality below zero in the upside case', () => {
    const base = { ...(defaultPoultryAssumptions('broiler') as object), mortalityPct: 0.5 } as never;
    expect((scenarioAssumptions(base, 'broiler', 'upside') as Record<string, number>).mortalityPct).toBe(0);
  });

  it('uses the egg price and laying mortality for layers, and every key field is a real assumption', () => {
    const base = defaultPoultryAssumptions('layer-cage') as unknown as Record<string, number>;
    expect(Object.keys(scenarioAssumptions(base as never, 'layer-cage', 'downside'))).toContain('eggInr');
    for (const kind of ['meat', 'eggs'] as const) {
      const sample = defaultPoultryAssumptions(kind === 'meat' ? 'broiler' : 'layer-cage') as unknown as Record<string, number>;
      for (const { field } of KEY_FIELDS[kind]) expect(sample[field]).toBeTypeOf('number');
    }
  });
});
