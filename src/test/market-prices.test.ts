/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const db = require('../../backend/config/db');
const app = require('../../backend/app');
const { clearReferenceCache } = require('../../backend/services/referenceData');
const { parseTonnesPerHectare, indicativeRevenue, buildMarketPrices, loadLatestPrices } = require('../../backend/services/marketPrices');
const { upsertPrices, parseRecord } = require('../../backend/scripts/ingestMandiPrices');

const summary = (markets: number, median: number) => ({
  markets,
  medianInrPerQuintal: median,
  lowInrPerQuintal: median - 100,
  highInrPerQuintal: median + 100,
});

describe('yield parsing', () => {
  it('reads tonnes per hectare ranges and rejects other units', () => {
    expect(parseTonnesPerHectare('80-120 t/ha')).toEqual({ low: 80, high: 120 });
    expect(parseTonnesPerHectare('12.5-18 t/ha')).toEqual({ low: 12.5, high: 18 });
    expect(parseTonnesPerHectare('250-350 stems/m2/year')).toBeNull();
    expect(parseTonnesPerHectare('')).toBeNull();
  });
});

describe('indicative revenue', () => {
  // 300 m2 = 0.03 ha; a median of Rs 3,000 per quintal is Rs 30,000 per tonne.
  it('multiplies yield, area and the median price', () => {
    const out = indicativeRevenue('40-60 t/ha', 300, { state: summary(5, 3000), india: summary(100, 2000) });
    expect(out).toEqual({ basis: 'state', lowInr: 36000, highInr: 54000 });
  });

  it('falls back to the national price when the state has fewer than 3 markets', () => {
    const out = indicativeRevenue('40-60 t/ha', 300, { state: summary(1, 1200), india: summary(100, 3000) });
    expect(out?.basis).toBe('india');
    expect(out?.lowInr).toBe(36000);
  });

  it('uses the national price when the state has no prices', () => {
    expect(indicativeRevenue('40-60 t/ha', 300, { state: null, india: summary(100, 3000) })?.basis).toBe('india');
  });

  it('gives no value for stems-per-area yields or zero area', () => {
    expect(indicativeRevenue('250-350 stems/m2/year', 300, { state: null, india: summary(100, 3000) })).toBeNull();
    expect(indicativeRevenue('40-60 t/ha', 0, { state: null, india: summary(100, 3000) })).toBeNull();
  });
});

describe('buildMarketPrices', () => {
  const crops = [
    { name: 'Tomato', expectedYield: '40-60 t/ha' },
    { name: 'Strawberry', expectedYield: '15-25 t/ha' }, // not on the mandi feed
    { name: 'Cucumber', expectedYield: '200-300 t/ha' },
  ];

  it('keeps only crops with a mandi feed and looks up the published commodity name', async () => {
    const asked: string[] = [];
    const loader = async (commodity: string) => {
      asked.push(commodity);
      return { date: '2026-10-13', stale: false, india: summary(50, 3000), state: null };
    };
    const out = await buildMarketPrices({ crops, stateName: 'Kerala', areaSqm: 300, loader });
    expect(out.map((c: { crop: string }) => c.crop)).toEqual(['Tomato', 'Cucumber']);
    expect(asked).toEqual(['Tomato', 'Cucumbar(Kheera)']);
  });

  it('skips crops with nothing stored', async () => {
    const out = await buildMarketPrices({ crops, stateName: 'Kerala', areaSqm: 300, loader: async () => null });
    expect(out).toEqual([]);
  });
});

describe('with stored prices', () => {
  const row = (over: Record<string, string> = {}) =>
    parseRecord({
      state: 'Kerala', district: 'Ernakulam', market: 'M1', commodity: 'Tomato', variety: 'Local', grade: 'FAQ',
      arrival_date: '13/10/2026', min_price: '1900', max_price: '2100', modal_price: '2000', ...over,
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = 'pglite:memory';
    await db.connectDb();
    const { loadReferenceData } = require('../../backend/scripts/loadReferenceData');
    await loadReferenceData(db.query);
    await upsertPrices(db.query, [
      row({ market: 'A', modal_price: '2000' }),
      row({ market: 'B', modal_price: '3000' }),
      row({ market: 'C', modal_price: '4000' }),
      row({ market: 'D', state: 'Punjab', district: 'Ludhiana', modal_price: '1000' }),
      row({ market: 'Old', arrival_date: '01/10/2026', modal_price: '9999' }), // an older day must be ignored
    ]);
    clearReferenceCache();
  }, 120_000);
  afterAll(async () => {
    await db.closeDb();
  });

  it('summarises only the latest day, for the state and for India', async () => {
    const out = await loadLatestPrices('Tomato', 'Kerala');
    expect(out.date).toBe('2026-10-13');
    expect(out.india).toMatchObject({ markets: 4, medianInrPerQuintal: 2500, lowInrPerQuintal: 1000, highInrPerQuintal: 4000 });
    expect(out.state).toMatchObject({ markets: 3, medianInrPerQuintal: 3000, lowInrPerQuintal: 2000, highInrPerQuintal: 4000 });
  });

  it('has no state summary when the state reported nothing', async () => {
    expect((await loadLatestPrices('Tomato', 'Goa')).state).toBeNull();
  });

  it('flags prices older than a week as stale', async () => {
    await upsertPrices(db.query, [row({ commodity: 'Capsicum', arrival_date: '01/01/2026' })]);
    expect((await loadLatestPrices('Capsicum', 'Kerala')).stale).toBe(true);
  });

  it('returns null for a commodity with no rows', async () => {
    expect(await loadLatestPrices('Gerbera', 'Kerala')).toBeNull();
  });

  it('is attached to a calculation without changing its price', async () => {
    const body = {
      length: 30, width: 10, gutterHeight: 4, ridgeHeight: 6, polyhouseType: 'naturally-ventilated', roofType: 'gable',
      structureMaterial: 'gi-steel', coverMaterial: 'uv-polyfilm', sideVentilation: 'manual-rollup', doorEntry: 'single-sliding',
      state: 'Kerala', district: 'Ernakulam',
    };
    const res = await request(app).post('/api/polyhouse/calculate').send(body);
    expect(res.status).toBe(200);
    const tomato = res.body.data.reference.marketPrices.find((p: { crop: string }) => p.crop === 'Tomato');
    expect(tomato.state.markets).toBe(3);
    expect(tomato.revenue.basis).toBe('state');
    expect(res.body.data.cost.totalCost).toBeGreaterThan(0);
  });
});
