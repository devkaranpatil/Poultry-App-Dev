/** @vitest-environment node */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseCsv } = require('../../backend/scripts/loadReferenceData');
const { PUBLISHED_YIELDS, CROPS_BY_CLIMATE_GROUP, CROP_LIBRARY } = require('../../backend/data/cultivation');
const { deriveCrops, toSuggestionText } = require('../../backend/services/cropAdvisor');

type YieldRow = { crop: string; measure: string; yield_low: string; yield_high: string; unit: string; used_by_app: string; source_url: string };
const rows: YieldRow[] = parseCsv(fs.readFileSync(path.resolve(__dirname, '../../datasets/csv/crop_yields_published.csv'), 'utf8'));
const used = rows.filter((row) => row.used_by_app === 'yes');

describe('published crop yields', () => {
  it('only uses measured values, never a potential or a misprint', () => {
    expect(used.length).toBeGreaterThan(0);
    for (const row of used) expect(row.measure).toBe('measured');
    for (const row of rows.filter((r) => r.measure !== 'measured')) expect(row.used_by_app).toBe('no');
  });

  it('matches the numbers in the backend, rounded to whole units', () => {
    expect(Object.keys(PUBLISHED_YIELDS).sort()).toEqual(used.map((row) => row.crop).sort());
    for (const row of used) {
      const unit = row.unit === 'flowers/m2/year' ? 'stems/m2/year' : row.unit;
      const expected = `${Math.round(Number(row.yield_low))}-${Math.round(Number(row.yield_high))} ${unit}`;
      expect(PUBLISHED_YIELDS[row.crop].expectedYield).toBe(expected);
      expect(PUBLISHED_YIELDS[row.crop].url).toBe(row.source_url);
    }
  });

  it('replaces the old yield text for those crops in every climate group and in the crop library', () => {
    for (const group of Object.values(CROPS_BY_CLIMATE_GROUP) as string[][][]) {
      for (const [name, , yieldText] of group) {
        if (PUBLISHED_YIELDS[name]) expect(yieldText).toBe(PUBLISHED_YIELDS[name].expectedYield);
      }
    }
    for (const profile of Object.values(CROP_LIBRARY) as { name: string; expectedYield: string }[]) {
      if (PUBLISHED_YIELDS[profile.name]) expect(profile.expectedYield).toBe(PUBLISHED_YIELDS[profile.name].expectedYield);
    }
  });

  it('no longer claims the yields that no published trial supports', () => {
    const everyYield = Object.values(CROPS_BY_CLIMATE_GROUP).flat().map((row) => (row as string[])[2]);
    expect(everyYield).not.toContain('200-300 t/ha'); // cucumber, was far above any published figure
    expect(everyYield).not.toContain('250-350 stems/m2/year');
  });
});

describe('crop suggestions carry their yield source', () => {
  it('tags published crops with the paper and tags the rest as unverified', () => {
    const crops = deriveCrops('Composite', 'tomato', 'drip');
    const tomato = crops.find((c: { name: string }) => c.name === 'Tomato');
    const strawberry = crops.find((c: { name: string }) => c.name === 'Strawberry');
    expect(tomato.expectedYield).toBe('45-84 t/ha');
    expect(tomato.yieldSource.source).toMatch(/Verma, Jha and Baiswar \(2018\)/);
    expect(tomato.yieldSource.url).toMatch(/^https:\/\//);
    expect(strawberry.yieldSource).toBeNull();
  });

  it('labels each line of the text summary', () => {
    const text = toSuggestionText(deriveCrops('Composite', 'tomato', 'drip'), 'Composite');
    expect(text).toMatch(/Tomato .*45-84 t\/ha \(published trials\)/);
    expect(text).toMatch(/Strawberry .*\(unverified estimate\)/);
  });
});
