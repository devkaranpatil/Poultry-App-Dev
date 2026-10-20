/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const require = createRequire(import.meta.url);
const db = require('../../backend/config/db');
const { createRateLimiter } = require('../../backend/middleware/rateLimit');
// express is a backend-only dependency, so resolve it from the backend package.
const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url));
const express = backendRequire('express');

type Handler = (req: { headers: Record<string, string> }, res: unknown, next: () => void) => void;

const savedEnv = { ...process.env };
afterEach(async () => {
  process.env = { ...savedEnv };
  db.setDbForTesting(null);
  await db.closeDb();
});

describe('database module', () => {
  it('runs without a database outside production', async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'development';
    expect(await db.connectDb()).toBeNull();
    expect(db.getDbStatus().state).toBe('disabled');
    expect(() => db.getDb()).toThrow(/not connected/);
  });

  it('refuses to start in production without DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';
    await expect(db.connectDb()).rejects.toThrow(/DATABASE_URL is required/);
  });

  it('refuses the in-process PGlite database in production', async () => {
    process.env.DATABASE_URL = 'pglite:memory';
    process.env.NODE_ENV = 'production';
    await expect(db.connectDb()).rejects.toThrow(/not pglite/);
  });

  it('accepts an injected database for tests', async () => {
    const calls: string[] = [];
    db.setDbForTesting({ query: async (text: string) => (calls.push(text), { rows: [] }) });
    await db.query('select 1');
    expect(calls).toEqual(['select 1']);
    expect(db.getDbStatus().state).toBe('connected');
  });

  it('applies the supabase migrations to an in-process Postgres and reports it connected', async () => {
    process.env.DATABASE_URL = 'pglite:memory';
    process.env.NODE_ENV = 'development';
    await db.connectDb();
    expect(db.getDbStatus().state).toBe('connected');
    const { rows } = await db.query(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
    );
    expect(rows.map((r: { table_name: string }) => r.table_name)).toEqual([
      'app_users',
      'cost_norms',
      'district_climate_monthly',
      'district_climate_unresolved',
      'mandi_prices_daily',
      'midh_area_limits',
      'poultry_production_norms',
      'poultry_scheme_rules',
      'poultry_siting_rules',
      'poultry_unit_costs',
      'saved_configurations',
    ]);
  }, 60_000);
});

describe('rate limiter', () => {
  function appWith(limiter: Handler) {
    const app = express();
    app.get('/', limiter, (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('returns 429 with Retry-After once the budget is spent', async () => {
    const app = appWith(createRateLimiter({ windowMs: 60_000, max: 2 }));
    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/')).status).toBe(200);
    const blocked = await request(app).get('/');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keys buckets with a custom key generator (e.g. per user)', async () => {
    const app = appWith(
      createRateLimiter({ windowMs: 60_000, max: 1, keyGenerator: (req: { headers: Record<string, string> }) => String(req.headers['x-user']) })
    );
    expect((await request(app).get('/').set('x-user', 'a')).status).toBe(200);
    expect((await request(app).get('/').set('x-user', 'b')).status).toBe(200);
    expect((await request(app).get('/').set('x-user', 'a')).status).toBe(429);
  });
});

describe('app wiring', () => {
  const app = require('../../backend/app');

  it('serves every state with its districts', async () => {
    const response = await request(app).get('/api/location/states-districts');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data)).toHaveLength(28);
    expect(response.body.data['Madhya Pradesh']).toContain('Indore');
  });

  it('returns 404 JSON for unknown routes', async () => {
    const response = await request(app).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it('sets baseline security headers', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });
});
