/** @vitest-environment node */
import { createRequire } from 'module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const db = require('../../backend/config/db');
const { loadReferenceData, parseCsv } = require('../../backend/scripts/loadReferenceData');

const USER_ID = '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  process.env.DATABASE_URL = 'pglite:memory';
  await db.connectDb();
}, 60_000);

afterAll(async () => {
  await db.closeDb();
});

describe('schema constraints', () => {
  it('treats email as case-insensitively unique', async () => {
    await db.query("insert into app_users (id, name, email) values ($1, 'A', 'Same@Example.test')", [USER_ID]);
    await expect(
      db.query("insert into app_users (name, email) values ('B', 'same@example.TEST')")
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('links each Supabase user to at most one profile', async () => {
    const authId = '33333333-3333-4333-8333-333333333333';
    await db.query("insert into app_users (name, email, auth_user_id) values ('E', 'e1@example.test', $1)", [authId]);
    await expect(
      db.query("insert into app_users (name, email, auth_user_id) values ('F', 'e2@example.test', $1)", [authId])
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects an unknown config type and a non-object config', async () => {
    const insert = (type: string, config: string) =>
      db.query(
        "insert into saved_configurations (user_id, name, normalized_name, config_type, config) values ($1, 'n', 'n', $2, $3::jsonb)",
        [USER_ID, type, config]
      );
    await expect(insert('spaceship', '{}')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('greenhouse', '[1,2]')).rejects.toMatchObject({ code: '23514' });
  });

  it("accepts poultry designs alongside the polyhouse planner's own types", async () => {
    for (const [index, type] of ['greenhouse', 'polyhouse', 'poultry'].entries()) {
      await db.query(
        "insert into saved_configurations (user_id, name, normalized_name, config_type, config) values ($1, $2, $2, $3, '{}'::jsonb)",
        [USER_ID, `type-${index}`, type]
      );
    }
    const { rows } = await db.query(
      "select count(*) as n from pg_constraint where conrelid = 'public.saved_configurations'::regclass and contype = 'c' and conname like '%config_type%'"
    );
    expect(Number(rows[0].n)).toBe(1); // the old check was replaced, not joined by a second one
  });

  it('removes a user configurations when the user is deleted', async () => {
    const id = '22222222-2222-4222-8222-222222222222';
    await db.query("insert into app_users (id, name, email) values ($1, 'D', 'cascade@example.test')", [id]);
    await db.query("insert into saved_configurations (user_id, name, normalized_name, config) values ($1, 'n', 'n', '{}')", [id]);
    await db.query('delete from app_users where id = $1', [id]);
    const left = await db.query(
      'select count(*) as c from saved_configurations where user_id = $1',
      [id]
    );
    expect(Number(left.rows[0].c)).toBe(0);
  });
});

describe('reference datasets', () => {
  it('parses quoted CSV fields with commas and doubled quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });

  it('loads every official CSV into its table with matching row counts, and can be re-run', async () => {
    const first = await loadReferenceData(db.query);
    expect(first).toEqual({
      district_climate_monthly: 7020,
      district_climate_unresolved: 177,
      poultry_unit_costs: 165,
      poultry_production_norms: 7,
      poultry_scheme_rules: 17,
      poultry_siting_rules: 9,
    });
    expect(await loadReferenceData(db.query)).toEqual(first); // idempotent
    const { rows } = await db.query('select count(*) as n from district_climate_monthly');
    expect(Number(rows[0].n)).toBe(7020);
  }, 60_000);

  it('never touches the polyhouse tables of the shared database, and can load only the poultry tables', async () => {
    await db.query(
      "insert into cost_norms (scheme, component, structure_type, cost_norm_inr, unit, source_document, source_url) values ('MIDH/NHB', 'c', 'polyhouse row', 844, 'per sq m', 'd', 'u')"
    );
    const before = await db.query('select count(*) as n from cost_norms');
    await loadReferenceData(db.query);
    const counts = await loadReferenceData(db.query, undefined, { only: 'poultry' });
    expect(Object.keys(counts)).toEqual(['poultry_unit_costs', 'poultry_production_norms', 'poultry_scheme_rules', 'poultry_siting_rules']);
    const after = await db.query('select count(*) as n from cost_norms');
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const { rows } = await db.query("select cap_inr, verified from poultry_scheme_rules where scheme_id = 'nlm-edp-rural-poultry'");
    expect(rows[0]).toMatchObject({ verified: true });
    expect(Number(rows[0].cap_inr)).toBe(2500000);
    await loadReferenceData(db.query); // restore the full set for the tests below
  }, 60_000);

  it('has 540 districts x 13 month rows, each with a full set of core measurements', async () => {
    const { rows } = await db.query(
      'select count(distinct (state, district)) as d, count(*) filter (where t2m_mean_c is null or precip_mm_per_day is null) as missing from district_climate_monthly'
    );
    expect([Number(rows[0].d), Number(rows[0].missing)]).toEqual([540, 0]);
  });
});

describe('public API lockdown (Supabase anon role)', () => {
  type Pg = {
    query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
    exec: (sql: string) => Promise<unknown>;
    close: () => Promise<void>;
  };
  let lock: Pg;

  beforeAll(async () => {
    // Recreate what a Supabase project looks like BEFORE our migration runs: the anon/authenticated roles
    // exist and every new table in public is granted to them by default. The migration must then lock it down.
    const { PGlite } = require('@electric-sql/pglite');
    const fs = require('fs');
    lock = new PGlite() as Pg;
    await lock.exec(`
      create role anon nologin; create role authenticated nologin;
      grant usage on schema public to anon, authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    for (const file of fs.readdirSync('supabase/migrations').sort()) {
      await lock.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    await lock.exec(`insert into cost_norms (scheme, component, structure_type, cost_norm_inr, unit, source_document, source_url)
                     values ('MIDH/NHB', 'c', 't', 844, 'per sq m', 'd', 'u');
                     insert into app_users (name, email) values ('X', 'x@example.test');`);
  }, 60_000);

  afterAll(async () => {
    await lock.close();
  });

  const asAnon = async (sql: string) => {
    await lock.exec('set role anon');
    try {
      return await lock.query(sql);
    } finally {
      await lock.exec('reset role');
    }
  };

  it('lets anonymous clients read the public reference data', async () => {
    const result = await asAnon('select count(*) as n from cost_norms');
    expect(Number(result.rows[0].n)).toBe(1);
  });

  it('blocks anonymous clients from reading user data', async () => {
    await expect(asAnon('select * from app_users')).rejects.toThrow(/permission denied/);
    await expect(asAnon('select * from saved_configurations')).rejects.toThrow(/permission denied/);
  });

  it('blocks anonymous clients from changing reference or user data', async () => {
    await expect(asAnon("delete from cost_norms where scheme = 'MIDH/NHB'")).rejects.toThrow(/permission denied/);
    await expect(
      asAnon("insert into cost_norms (scheme, component, structure_type, cost_norm_inr, unit, source_document, source_url) values ('a','b','c',1,'u','d','e')")
    ).rejects.toThrow(/permission denied/);
    await expect(asAnon("update app_users set name = 'hacked'")).rejects.toThrow(/permission denied/);
    const still = await lock.query('select count(*) as n from cost_norms');
    expect(Number(still.rows[0].n)).toBe(1);
  });
});
