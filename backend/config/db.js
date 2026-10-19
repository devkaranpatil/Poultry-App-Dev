const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Connection to Postgres. DATABASE_URL is either
//   - the Supabase connection string (Project Settings -> Database -> Connection string; use the
//     pooled "Transaction" or "Session" URI), or
//   - pglite:memory / pglite:./some/dir for an in-process Postgres (PGlite) with no server to run.
//     It applies supabase/migrations itself, so local development, e2e and CI need no database setup.
//     Not for production.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

let pool = null;
let testDb = null;
let connectPromise = null;
let dbStatus = {
  state: "disconnected",
  databaseName: null,
  error: null,
};

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function isProduction() {
  return String(process.env.NODE_ENV || "development").toLowerCase() === "production";
}

function isLocalHost(connectionString) {
  try {
    const { hostname } = new URL(connectionString);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Supabase requires TLS. Node does not ship Supabase's CA, so without DATABASE_SSL_CA the connection
 * is encrypted but the server certificate is not verified. Download the CA from the Supabase dashboard
 * (Project Settings -> Database -> SSL Configuration) and point DATABASE_SSL_CA at it to verify.
 */
function buildSslOptions(connectionString) {
  if (isLocalHost(connectionString) || String(process.env.DATABASE_SSL || "").toLowerCase() === "disable") {
    return false;
  }
  const caPath = String(process.env.DATABASE_SSL_CA || "").trim();
  if (caPath) {
    return { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

/** Starts PGlite and applies the migrations when the schema is not there yet. */
async function openPglite(connectionString) {
  const { PGlite } = require("@electric-sql/pglite");
  const target = connectionString.slice("pglite:".length) || "memory";
  let db;
  if (target === "memory") {
    db = new PGlite();
  } else {
    // Relative paths are relative to backend/, not to wherever node was started from.
    const dataDir = path.resolve(__dirname, "..", target);
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    db = new PGlite(dataDir);
  }
  await db.waitReady;
  const { rows } = await db.query("select to_regclass('public.app_users') as users_table");
  if (!rows[0].users_table) {
    // Supabase provides these roles; the migrations grant to them.
    await db.exec(`do $$ begin
      if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;`);
    for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort()) {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    }
  }
  return db;
}

async function connectDb() {
  if (testDb) return testDb;
  if (pool) return pool;
  if (connectPromise) return connectPromise;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    dbStatus = {
      state: "disabled",
      databaseName: null,
      error: "DATABASE_URL is not configured",
    };

    if (isProduction()) {
      throw new Error("DATABASE_URL is required in backend/.env");
    }

    console.warn("Database: DATABASE_URL is not configured; auth storage is disabled.");
    return null;
  }

  dbStatus = { state: "connecting", databaseName: null, error: null };

  const usePglite = connectionString.startsWith("pglite:");
  if (usePglite && isProduction()) {
    throw new Error("DATABASE_URL must be a real Postgres connection string in production, not pglite:");
  }

  connectPromise = (async () => {
    let candidate = null;
    try {
      if (usePglite) {
        candidate = await openPglite(connectionString);
      } else {
        candidate = new Pool({
          connectionString,
          max: Number(process.env.DATABASE_POOL_MAX || 10),
          connectionTimeoutMillis: 5_000,
          idleTimeoutMillis: 30_000,
          ssl: buildSslOptions(connectionString),
        });
        // An idle client erroring (e.g. the pooler restarting) must not crash the process.
        candidate.on("error", (error) => console.error("Database: idle client error", error.message));
      }
      const { rows } = await candidate.query(
        "select current_database() as name, to_regclass('public.app_users') as users_table"
      );
      if (!rows[0].users_table) {
        throw new Error(
          "Database schema is missing. Apply supabase/migrations (supabase db push, or run the SQL in the SQL editor)."
        );
      }
      pool = candidate;
      dbStatus = { state: "connected", databaseName: rows[0].name, error: null };
      console.log(`Database: connected to Postgres (${rows[0].name})`);
      return pool;
    } catch (error) {
      dbStatus = { state: "error", databaseName: null, error: error.message };
      connectPromise = null;
      await closeHandle(candidate);
      throw error;
    }
  })();

  return connectPromise;
}

function getDb() {
  const db = testDb || pool;
  if (!db) {
    throw new Error("Database is not connected yet");
  }
  return db;
}

/** Runs a parameterised query: query("select * from app_users where id = $1", [id]). */
function query(text, params) {
  return getDb().query(text, params);
}

function getDbStatus() {
  return { ...dbStatus };
}

async function closeHandle(handle) {
  if (!handle) return;
  try {
    if (typeof handle.end === "function") await handle.end();
    else if (typeof handle.close === "function") await handle.close();
  } catch {
    // Already closed or never opened; nothing more to release.
  }
}

async function closeDb() {
  await closeHandle(pool);
  pool = null;
  connectPromise = null;
  dbStatus = { state: "disconnected", databaseName: null, error: null };
}

// Test hook: swap in any object exposing query(text, params) (the tests use in-process Postgres).
function setDbForTesting(fake) {
  testDb = fake;
  dbStatus = { state: fake ? "connected" : "disconnected", databaseName: fake ? "test" : null, error: null };
}

module.exports = {
  setDbForTesting,
  closeDb,
  connectDb,
  getDb,
  getDbStatus,
  query,
};
