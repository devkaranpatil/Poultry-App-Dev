import { describe, expect, it } from 'vitest';
import { formatINR, formatINRCompact, formatINRPlain } from '@/lib/format';
import { decodeShareParam, encodeShareParam, loadDraft, saveDraft } from '@/lib/configPersistence';
import { DEFAULT_CONFIG, keepCompatible, normalizeFarmConfig, optionKey } from '@/types/farm';

describe('format', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(471750)).toBe('₹4,71,750');
    expect(formatINRPlain(471750)).toBe('Rs 4,71,750');
  });

  it('switches to lakh and crore for large values', () => {
    expect(formatINRCompact(471750)).toBe('₹4.72 L');
    expect(formatINRCompact(12_500_000)).toBe('₹1.25 Cr');
    expect(formatINRCompact(-250000)).toBe('-₹2.50 L');
    expect(formatINRCompact(9500)).toBe('₹9,500');
  });
});

describe('the shed setup', () => {
  it('keeps known fields and replaces bad values with defaults', () => {
    const config = normalizeFarmConfig({ length: 'twelve' as unknown as number, birdType: 'ostrich' as never, injected: 1 } as never);
    expect(config.length).toBe(DEFAULT_CONFIG.length);
    expect(config.birdType).toBe('broiler');
    expect(config).not.toHaveProperty('injected');
    expect(normalizeFarmConfig({ stockingDensity: 1.2 }).stockingDensity).toBe(1.2);
    expect(normalizeFarmConfig({ stockingDensity: -1 }).stockingDensity).toBeNull();
    expect(normalizeFarmConfig({ cageTiers: 7 as never }).cageTiers).toBe(3);
  });

  it('makes the choices a bird or shed type forces, as the backend validator expects', () => {
    expect(keepCompatible({ ...DEFAULT_CONFIG, birdType: 'layer-cage' })).toMatchObject({ feedingSystem: 'trough', farmingModel: 'independent' });
    expect(keepCompatible({ ...DEFAULT_CONFIG, birdType: 'layer-floor', housingSystem: 'environment-controlled' }).housingSystem).toBe('open-sided');
    expect(keepCompatible({ ...DEFAULT_CONFIG, housingSystem: 'environment-controlled' }).sideWalls).toBe('closed-tunnel');
    expect(keepCompatible({ ...DEFAULT_CONFIG, birdType: 'desi', housingSystem: 'backyard' })).toMatchObject({ frameMaterial: 'bamboo-wood' });
    expect(keepCompatible({ ...DEFAULT_CONFIG, roofSheet: 'thatch' }).roofSheet).toBe('gi-sheet');
    expect(keepCompatible({ ...DEFAULT_CONFIG, sideWalls: 'closed-tunnel' }).sideWalls).toBe('mesh-curtain');
  });

  it('names each option by its i18n key', () => {
    expect(optionKey('housing', 'environment-controlled')).toBe('options.housing.environmentControlled');
    expect(optionKey('bird', 'broiler')).toBe('options.bird.broiler');
  });
});

describe('config persistence', () => {
  const config = { ...DEFAULT_CONFIG, state: 'Maharashtra', district: 'Pune' };

  it('round-trips a setup through a share link', () => {
    const encoded = encodeShareParam(config);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShareParam(encoded)).toEqual(config);
  });

  it('rejects malformed share values', () => {
    expect(decodeShareParam('%%%not-base64')).toBeNull();
    expect(decodeShareParam(btoa('[1,2,3]'))).toBeNull();
    expect(decodeShareParam(null)).toBeNull();
  });

  it('saves and restores the working draft', () => {
    saveDraft(config);
    expect(loadDraft()).toEqual(config);
  });
});
