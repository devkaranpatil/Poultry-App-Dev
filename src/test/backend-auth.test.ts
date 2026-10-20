/** @vitest-environment node */
import { createRequire } from 'module';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installFakeSupabase } from './helpers/fakeSupabase';

const supabase = installFakeSupabase();

const require = createRequire(import.meta.url);
const app = require('../../backend/app');
const { connectDb, closeDb, query } = require('../../backend/config/db');
const { clearTokenCache } = require('../../backend/services/supabaseAuth');

// Real Postgres (PGlite) with the actual supabase/migrations applied, through the production connect path.
beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite:memory';
  await connectDb();
}, 60_000);

afterAll(async () => {
  await closeDb();
  supabase.restore();
});

beforeEach(() => {
  clearTokenCache();
  supabase.setOutage(false);
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Supabase session verification', () => {
  it('creates the profile on first sight and returns it', async () => {
    const token = supabase.signIn({ email: 'Grower1@Example.test', name: 'Asha Patil' });
    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: 'grower1@example.test', name: 'Asha Patil', emailVerified: true });
    const rows = await query("select count(*)::int as n from app_users where email = 'grower1@example.test'");
    expect(rows.rows[0].n).toBe(1);
  });

  it('uses the same profile on every later request', async () => {
    const token = supabase.signIn({ email: 'grower2@example.test' });
    const first = await request(app).get('/api/auth/me').set(bearer(token));
    clearTokenCache();
    const second = await request(app).get('/api/auth/me').set(bearer(token));
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(first.body.user.name).toBe('grower2'); // falls back to the part before the @
  });

  it('rejects a missing, unknown or signed-out token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer('made-up'))).status).toBe(401);

    const token = supabase.signIn({ email: 'grower3@example.test' });
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(200);
    supabase.signOut(token);
    clearTokenCache();
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('answers 500, not 401, when Supabase itself is down', async () => {
    const token = supabase.signIn({ email: 'grower4@example.test' });
    supabase.setOutage(true);
    const response = await request(app).get('/api/auth/me').set(bearer(token));
    expect(response.status).toBe(500);
  });

  it('keeps old saved data by adopting the profile with the same confirmed email', async () => {
    const oldId = '44444444-4444-4444-8444-444444444444';
    await query("insert into app_users (id, name, email) values ($1, 'Old Name', 'legacy@example.test')", [oldId]);
    await query(
      "insert into saved_configurations (user_id, name, normalized_name, config_type, config) values ($1, 'Old plan', 'old plan', 'poultry', '{}')",
      [oldId]
    );

    const token = supabase.signIn({ email: 'legacy@example.test', name: 'New Name' });
    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.body.user.id).toBe(oldId);
    expect(me.body.user.name).toBe('New Name');

    const saved = await request(app).get('/api/configurations').set(bearer(token));
    expect(saved.body.configurations.map((c: { name: string }) => c.name)).toEqual(['Old plan']);
  });

  it('does not hand a profile to someone whose email is not confirmed', async () => {
    await query("insert into app_users (name, email) values ('Victim', 'victim@example.test')");
    const token = supabase.signIn({ email: 'victim@example.test', confirmed: false });
    const response = await request(app).get('/api/auth/me').set(bearer(token));
    expect(response.status).toBe(409);
    expect(response.body.user).toBeUndefined();
  });

  it('refuses a second Supabase user claiming an address already linked', async () => {
    const first = supabase.signIn({ email: 'shared@example.test' });
    expect((await request(app).get('/api/auth/me').set(bearer(first))).status).toBe(200);
    const second = supabase.signIn({ email: 'shared@example.test' });
    expect((await request(app).get('/api/auth/me').set(bearer(second))).status).toBe(409);
  });

  it('no longer offers its own signup, login or password endpoints', async () => {
    for (const path of ['/api/auth/signup', '/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password']) {
      expect((await request(app).post(path).send({})).status, path).toBe(404);
    }
  });
});

describe('saved configurations', () => {
  it('stores configType as its own field and returns it on list', async () => {
    const auth = bearer(supabase.signIn({ email: 'grower6@example.test' }));

    const created = await request(app)
      .post('/api/configurations')
      .set(auth)
      .send({ name: 'North shed', configType: 'poultry', config: { length: 30, width: 10, birdType: 'broiler' } });
    expect(created.status).toBe(201);
    expect(created.body.configuration.configType).toBe('poultry');

    const listed = await request(app).get('/api/configurations').set(auth);
    expect(listed.body.configurations).toHaveLength(1);
    expect(listed.body.configurations[0].configType).toBe('poultry');
  });

  it('never lists, overwrites or deletes the polyhouse planner setups that share the database', async () => {
    const token = supabase.signIn({ email: 'grower10@example.test' });
    const auth = bearer(token);
    const me = await request(app).get('/api/auth/me').set(auth);
    const userId = me.body.user.id;
    const { rows } = await query(
      "insert into saved_configurations (user_id, name, normalized_name, config_type, config) values ($1, 'Tomato house', 'tomato house', 'greenhouse', '{\"length\":40}') returning id",
      [userId]
    );

    expect((await request(app).get('/api/configurations').set(auth)).body.configurations).toHaveLength(0);
    const clash = await request(app).post('/api/configurations').set(auth).send({ name: 'Tomato House', config: { length: 20 } });
    expect(clash.status).toBe(409);
    expect((await request(app).delete(`/api/configurations/${rows[0].id}`).set(auth)).status).toBe(404);

    const kept = await query('select config_type, config from saved_configurations where id = $1', [rows[0].id]);
    expect(kept.rows[0]).toMatchObject({ config_type: 'greenhouse', config: { length: 40 } });
  });

  it('saving the same name again overwrites it (200) and keeps one row', async () => {
    const auth = bearer(supabase.signIn({ email: 'grower7@example.test' }));

    const first = await request(app).post('/api/configurations').set(auth).send({ name: 'Shed A', config: { length: 20 } });
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/configurations').set(auth).send({ name: '  shed   a ', config: { length: 25 } });
    expect(second.status).toBe(200);
    expect(second.body.configuration.id).toBe(first.body.configuration.id);

    const listed = await request(app).get('/api/configurations').set(auth);
    expect(listed.body.configurations).toHaveLength(1);
    expect(listed.body.configurations[0].config.length).toBe(25);
    expect(listed.body.configurations[0].configType).toBe('poultry');
  });

  it('keeps each user configurations private and refuses to delete another user config', async () => {
    const owner = bearer(supabase.signIn({ email: 'owner@example.test' }));
    const other = bearer(supabase.signIn({ email: 'other@example.test' }));
    const created = await request(app).post('/api/configurations').set(owner).send({ name: 'Mine', config: { length: 10 } });

    const otherList = await request(app).get('/api/configurations').set(other);
    expect(otherList.body.configurations).toHaveLength(0);

    const del = await request(app).delete(`/api/configurations/${created.body.configuration.id}`).set(other);
    expect(del.status).toBe(404);
    const junk = await request(app).delete('/api/configurations/not-a-uuid').set(owner);
    expect(junk.status).toBe(404);
  });

  it('rejects a configuration with the wrong shape and stores only known fields', async () => {
    const auth = bearer(supabase.signIn({ email: 'grower9@example.test' }));
    const save = (body: object) => request(app).post('/api/configurations').set(auth).send(body);

    expect((await save({ name: 'List', config: [1, 2] })).status).toBe(400);
    const badLength = await save({ name: 'Text length', config: { length: 'thirty' } });
    expect(badLength.status).toBe(400);
    expect((await save({ config: { length: 30 } })).body.message).toBe('Configuration name is required');

    const kept = await save({ name: 'Clean', config: { length: 30, width: 10, injected: '<script>' } });
    expect(kept.status).toBe(201);
    expect(kept.body.configuration.config).toEqual({ length: 30, width: 10 });
  });

  it('rejects an unknown configType', async () => {
    const auth = bearer(supabase.signIn({ email: 'grower8@example.test' }));
    const response = await request(app)
      .post('/api/configurations')
      .set(auth)
      .send({ name: 'Bad', configType: 'spaceship', config: { length: 30 } });
    expect(response.status).toBe(400);
  });
});

describe('request handling', () => {
  it('returns 400 rather than 500 for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/farm/calculate')
      .set('Content-Type', 'application/json')
      .send('{"length": 30,');
    expect(response.status).toBe(400);
  });

  it('replaces an unsafe x-request-id header', async () => {
    const response = await request(app).get('/api/health').set('x-request-id', 'bad id with spaces');
    expect(response.headers['x-request-id']).not.toContain(' ');
  });
});
