/** @vitest-environment node */
import { createRequire } from 'module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const db = require('../../backend/config/db');
const { parseArrivalDate, parsePrice, parseRecord, upsertPrices, fetchCommodity } = require('../../backend/scripts/ingestMandiPrices');

// Test-only records shaped like the data.gov.in response (strings throughout, as the API sends them).
const record = (over: Record<string, string> = {}) => ({
  state: 'Maharashtra',
  district: 'Pune',
  market: 'Pune',
  commodity: 'Tomato',
  variety: 'Local',
  grade: 'FAQ',
  arrival_date: '13/10/2026',
  min_price: '1500',
  max_price: '2500',
  modal_price: '2000',
  ...over,
});

describe('parsing', () => {
  it('reads dd/mm/yyyy and ISO dates, and rejects anything else', () => {
    expect(parseArrivalDate('13/10/2026')).toBe('2026-10-13');
    expect(parseArrivalDate('2026-10-13T00:00:00')).toBe('2026-10-13');
    expect(parseArrivalDate('13-10-2026')).toBeNull();
    expect(parseArrivalDate('')).toBeNull();
  });

  it('keeps real prices and drops placeholders', () => {
    expect(parsePrice('2400')).toBe(2400);
    expect(parsePrice('1,250.5')).toBe(1250.5);
    expect(parsePrice('0')).toBe(0);
    expect(parsePrice('NA')).toBeNull();
    expect(parsePrice('')).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
    expect(parsePrice('-5')).toBeNull();
  });

  it('turns a record into a row, trimming text', () => {
    expect(parseRecord(record({ market: '  Pune  ' }))).toEqual({
      state: 'Maharashtra', district: 'Pune', market: 'Pune', commodity: 'Tomato', variety: 'Local', grade: 'FAQ',
      arrival_date: '2026-10-13', min_price: 1500, max_price: 2500, modal_price: 2000,
    });
  });

  it('skips records with no date, no market or no usable price', () => {
    expect(parseRecord(record({ arrival_date: 'bad' }))).toBeNull();
    expect(parseRecord(record({ market: '' }))).toBeNull();
    expect(parseRecord(record({ min_price: 'NA', max_price: 'NA', modal_price: 'NA' }))).toBeNull();
    expect(parseRecord(record({ min_price: 'NA', max_price: 'NA' }))).not.toBeNull(); // one price is enough
  });
});

describe('fetching', () => {
  const page = (records: object[]) => ({ ok: true, status: 200, json: async () => ({ records }) });

  it('follows pages until a short page and counts skipped records', async () => {
    const full = Array.from({ length: 500 }, (_, i) => record({ market: `Market ${i}` }));
    const calls: string[] = [];
    const fakeFetch = async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? page(full) : page([record({ market: 'Last' }), record({ arrival_date: 'bad' })]);
    };
    const { rows, skipped } = await fetchCommodity('KEY123', 'Tomato', fakeFetch as unknown as typeof fetch);
    expect(rows).toHaveLength(501);
    expect(skipped).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('offset=500');
    expect(calls[0]).toContain('filters[commodity]=Tomato');
  });

  it('never leaks the API key in an error message', async () => {
    const failing = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(fetchCommodity('SECRET-KEY-VALUE', 'Tomato', failing as unknown as typeof fetch)).rejects.toThrow(/HTTP 403 for Tomato/);
    await expect(fetchCommodity('SECRET-KEY-VALUE', 'Tomato', failing as unknown as typeof fetch)).rejects.not.toThrow(/SECRET-KEY-VALUE/);
  });
});

describe('storing', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = 'pglite:memory';
    await db.connectDb();
  }, 60_000);
  afterAll(async () => {
    await db.closeDb();
  });

  const count = async () => Number((await db.query('select count(*) as n from mandi_prices_daily')).rows[0].n);

  it('inserts, then updates the same market/day instead of duplicating', async () => {
    const row = parseRecord(record());
    expect(await upsertPrices(db.query, [row])).toBe(1);
    expect(await count()).toBe(1);

    expect(await upsertPrices(db.query, [{ ...row, modal_price: 2100 }])).toBe(1);
    expect(await count()).toBe(1);
    const { rows } = await db.query('select modal_price from mandi_prices_daily');
    expect(Number(rows[0].modal_price)).toBe(2100);
  });

  it('keeps a new day as a new row, building history', async () => {
    await upsertPrices(db.query, [parseRecord(record({ arrival_date: '14/10/2026' }))]);
    expect(await count()).toBe(2);
  });

  it('collapses duplicate keys inside one batch instead of failing', async () => {
    const dup = parseRecord(record({ market: 'Nashik' }));
    await expect(upsertPrices(db.query, [dup, { ...dup, modal_price: 1900 }])).resolves.toBe(1);
    const { rows } = await db.query("select modal_price from mandi_prices_daily where market = 'Nashik'");
    expect(Number(rows[0].modal_price)).toBe(1900); // the later record wins
  });

  it('stores rows with only some prices, leaving the rest null', async () => {
    await upsertPrices(db.query, [parseRecord(record({ market: 'Satara', min_price: 'NA', max_price: 'NA' }))]);
    const { rows } = await db.query("select min_price, modal_price from mandi_prices_daily where market = 'Satara'");
    expect(rows[0].min_price).toBeNull();
    expect(Number(rows[0].modal_price)).toBe(2000);
  });
});
