import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  INDIAN_DISTRICTS,
  INDIAN_STATES,
  clampDimension,
  normalizeFarmConfig,
} from '@/types/farm';
import { safeRedirectPath } from '@/lib/utils';

describe('normalizeFarmConfig', () => {
  it('drops unknown fields and replaces invalid values with defaults', () => {
    const normalized = normalizeFarmConfig({
      length: 40,
      roofType: 'dome',
      birdType: 'ostrich',
      _configType: 'poultry',
    } as never);

    expect(normalized.length).toBe(40);
    expect(normalized.roofType).toBe(DEFAULT_CONFIG.roofType);
    expect(normalized.birdType).toBe(DEFAULT_CONFIG.birdType);
    expect(normalized).not.toHaveProperty('_configType');
  });

  it('rejects non-numeric dimensions', () => {
    expect(normalizeFarmConfig({ width: Number.NaN }).width).toBe(DEFAULT_CONFIG.width);
  });
});

describe('clampDimension', () => {
  it('caps values at the shared maximum', () => {
    expect(clampDimension('length', 100000)).toBe(150);
    expect(clampDimension('width', 30)).toBe(18);
    expect(clampDimension('eavesHeight', 2.4)).toBe(2.4);
  });
});

describe('location data', () => {
  it('offers districts for every state, including Madhya Pradesh', () => {
    expect(INDIAN_STATES).toContain('Madhya Pradesh');
    for (const state of INDIAN_STATES) {
      expect(INDIAN_DISTRICTS[state].length).toBeGreaterThan(0);
    }
  });
});

describe('safeRedirectPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeRedirectPath('/account?tab=1')).toBe('/account?tab=1');
  });

  it('rejects other origins and non-strings', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/dashboard');
    expect(safeRedirectPath('//evil.example')).toBe('/dashboard');
    expect(safeRedirectPath('/\\evil.example')).toBe('/dashboard');
    expect(safeRedirectPath(undefined)).toBe('/dashboard');
  });
});
