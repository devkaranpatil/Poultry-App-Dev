import { describe, expect, it } from 'vitest';
import { formatINR, formatINRCompact, formatINRPlain } from '@/lib/format';
import {
  CROP_ECONOMICS,
  CULTIVABLE_AREA_SHARE,
  computeFinancials,
  defaultFinanceAssumptions,
  subsidyBase,
} from '@/lib/finance';
import { decodeShareParam, encodeShareParam, loadDraft, saveDraft } from '@/lib/configPersistence';
import { DEFAULT_CONFIG } from '@/types/farm';

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

describe('computeFinancials', () => {
  const assumptions = { subsidyPct: 50, yieldPerSqm: 10, pricePerUnit: 40, operatingCostPct: 40 };

  it('applies subsidy, revenue and operating cost', () => {
    const summary = computeFinancials(500000, 300, assumptions);

    expect(summary.subsidyAmount).toBe(250000);
    expect(summary.netInvestment).toBe(250000);
    expect(summary.annualProduction).toBeCloseTo(300 * CULTIVABLE_AREA_SHARE * 10);
    expect(summary.annualRevenue).toBeCloseTo(102000);
    expect(summary.annualProfit).toBeCloseTo(61200);
    expect(summary.paybackYears).toBeCloseTo(250000 / 61200);
    expect(summary.cumulativeCashflow[0]).toBe(-250000);
    expect(summary.cumulativeCashflow).toHaveLength(6);
  });

  it('only subsidises the first 4,000 m²', () => {
    const summary = computeFinancials(1_000_000, 8000, assumptions);
    expect(summary.subsidyAmount).toBe(250000);
  });

  it('applies the subsidy percentage to the cost the scheme recognises, not the whole build cost', () => {
    // Goa benchmark: Rs 4,95,338 build, but the MIDH 2025 norm recognises only Rs 3,60,000.
    const summary = computeFinancials(495338, 300, assumptions, { eligibleCostInr: 360_000, capInr: null });
    expect(summary.subsidyAmount).toBe(180_000);
    expect(summary.netInvestment).toBe(495338 - 180_000);
    expect(subsidyBase(495338, 300, { eligibleCostInr: 360_000, capInr: null })).toBe(360_000);
  });

  it("holds the scheme's per-project limit (NHB: Rs 56 lakh) whatever the percentage", () => {
    const summary = computeFinancials(30_000_000, 20000, { ...assumptions, subsidyPct: 75 }, { eligibleCostInr: 16_880_000, capInr: 5_600_000 });
    expect(summary.subsidyAmount).toBe(5_600_000);
  });

  it('reports no payback when the project loses money', () => {
    const summary = computeFinancials(500000, 300, { ...assumptions, operatingCostPct: 100 });
    expect(summary.paybackYears).toBeNull();
  });

  it('clamps out-of-range percentages', () => {
    const summary = computeFinancials(100000, 100, { ...assumptions, subsidyPct: 250 });
    expect(summary.netInvestment).toBe(0);
    expect(summary.roi).toBeNull();
  });

  it('provides crop-specific defaults', () => {
    expect(defaultFinanceAssumptions('gerbera').yieldPerSqm).toBe(226); // mean of 11 cultivars, Ahlawat et al. 2012
    expect(defaultFinanceAssumptions('tomato')).toMatchObject({ yieldPerSqm: 8.75, pricePerUnit: 30, subsidyPct: 50 });
    expect(defaultFinanceAssumptions('cucumber').yieldPerSqm).toBe(12); // was 25, above any published figure
  });

  it('says where every default comes from, and marks the assumptions', () => {
    for (const economics of Object.values(CROP_ECONOMICS)) {
      expect(economics.yieldSource.text.length).toBeGreaterThan(10);
      expect(economics.priceSource.text.length).toBeGreaterThan(10);
    }
    expect(CROP_ECONOMICS.lettuce.yieldSource.verified).toBe(false);
    expect(CROP_ECONOMICS.tomato.priceSource.text).toMatch(/Agmarknet/);
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
