/** @vitest-environment node */
import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const schemas = require('../../backend/validators/requestSchemas');

describe('AI request schemas', () => {
  it('keeps only sane planning numbers and drops the rest', () => {
    expect(schemas.financials.parse({ subsidyPct: 50, paybackYears: 'soon', roi: Number.NaN, annualProfit: 1e13 })).toEqual({ subsidyPct: 50 });
    expect(schemas.financials.parse({ paybackYears: null })).toEqual({ paybackYears: null });
    expect(schemas.financials.parse('not an object')).toBeNull();
    expect(schemas.financials.parse(undefined)).toBeNull();
  });

  it('falls back to English for an unknown interface language', () => {
    expect(schemas.locale.parse('mr')).toBe('mr');
    expect(schemas.locale.parse('fr')).toBe('en');
  });

  it('accepts a conversation that ends with the user, trimming each turn', () => {
    const turns = schemas.chatMessages.parse([
      { role: 'user', content: '  Hello  ' },
      { role: 'system', content: 'treated as the user' },
    ]);
    expect(turns).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'user', content: 'treated as the user' },
    ]);
  });

  it.each([
    ['an empty list', []],
    ['not a list', 'hello'],
    ['a last turn from the assistant', [{ role: 'assistant', content: 'Hi' }]],
    ['a blank message', [{ role: 'user', content: '   ' }]],
    ['a non-text message', [{ role: 'user', content: { $gt: '' } }]],
  ])('rejects %s', (_label, messages) => {
    expect(schemas.chatMessages.safeParse(messages).success).toBe(false);
  });

  it('only checks the turns it keeps, so an old broken turn does not fail a long chat', () => {
    const history = [{ role: 'user', content: '' }, ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: `m${i}` }))];
    expect(schemas.chatMessages.safeParse(history).success).toBe(true);
  });
});

describe('saved configuration schema', () => {
  it('tidies the name and defaults the type', () => {
    expect(schemas.saveConfigurationBody.parse({ name: '  North   block ', config: {} })).toEqual({ name: 'North block', config: {}, configType: 'greenhouse' });
  });

  it('rejects out-of-range numbers and over-long text', () => {
    expect(schemas.saveConfigurationBody.safeParse({ name: 'x', config: { length: -1 } }).success).toBe(false);
    expect(schemas.saveConfigurationBody.safeParse({ name: 'x', config: { district: 'a'.repeat(200) } }).success).toBe(false);
  });

  it('only accepts UUIDs as ids', () => {
    expect(schemas.configurationId.safeParse('8d5f3c2e-1b4a-4c6d-9e8f-0a1b2c3d4e5f').success).toBe(true);
    expect(schemas.configurationId.safeParse("1' or '1'='1").success).toBe(false);
  });
});
