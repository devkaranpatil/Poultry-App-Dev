import { beforeEach, describe, expect, it } from 'vitest';
import { saveEstimateHandoff, takeEstimateHandoff, HANDOFF_MAX_AGE_MS } from '@/lib/estimateHandoff';
import { DEFAULT_CONFIG } from '@/types/farm';

const config = { ...DEFAULT_CONFIG, state: 'Punjab', district: 'Ludhiana', length: 30, width: 9 };

describe('estimate hand-off', () => {
  beforeEach(() => window.localStorage.clear());

  it('carries the setup and the edited prices to the workspace once', () => {
    saveEstimateHandoff(config, { saleInrPerKg: 120 });
    const first = takeEstimateHandoff();
    expect(first?.config.district).toBe('Ludhiana');
    expect(first?.config.length).toBe(30);
    expect(first?.overrides).toEqual({ saleInrPerKg: 120 });
    expect(takeEstimateHandoff()).toBeNull();
  });

  it('drops a hand-off older than a day', () => {
    saveEstimateHandoff(config, {}, Date.now() - HANDOFF_MAX_AGE_MS - 1000);
    expect(takeEstimateHandoff()).toBeNull();
  });

  it('ignores anything malformed and keeps only numeric prices', () => {
    window.localStorage.setItem('farm.estimateHandoff.v1', '{not json');
    expect(takeEstimateHandoff()).toBeNull();
    window.localStorage.setItem(
      'farm.estimateHandoff.v1',
      JSON.stringify({ savedAt: Date.now(), config, overrides: { saleInrPerKg: '90', feedInrPerKg: 40 } })
    );
    expect(takeEstimateHandoff()?.overrides).toEqual({ feedInrPerKg: 40 });
  });
});
