// All SQL for the application tables lives here. Routes call these functions and never build queries,
// so the storage engine can change without touching the HTTP layer.
//
// Rows are mapped to the camelCase shape the routes already used with MongoDB, so API responses
// are unchanged: timestamps are ISO strings and passwordChangedAt is epoch milliseconds (number).

const { query } = require("../config/db");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === "string" && UUID.test(value);
const iso = (value) => (value === null || value === undefined ? null : new Date(value).toISOString());

/* ===================== users ===================== */

// app_users is the app's profile table. Credentials (passwords, Google) live in Supabase Auth and
// each profile is linked to its Supabase user through auth_user_id.
function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    emailVerified: row.email_verified,
    createdAt: iso(row.created_at),
    lastLoginAt: iso(row.last_login_at),
  };
}

const users = {
  async findByAuthUserId(authUserId) {
    if (!isUuid(authUserId)) return null;
    const { rows } = await query("select * from app_users where auth_user_id = $1", [authUserId]);
    return userFromRow(rows[0]);
  },

  async findByEmail(email) {
    const { rows } = await query("select * from app_users where lower(email) = lower($1)", [String(email)]);
    return userFromRow(rows[0]);
  },

  async insert(user) {
    await query(
      `insert into app_users (id, auth_user_id, name, email, avatar_url, email_verified, created_at, last_login_at)
       values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz)`,
      [
        user.id,
        user.authUserId,
        user.name,
        user.email,
        user.avatarUrl ?? null,
        Boolean(user.emailVerified),
        user.createdAt,
        user.lastLoginAt ?? null,
      ]
    );
  },

  /** Attaches a Supabase user to an existing profile (matched by confirmed email) and refreshes it. */
  async linkAuthUser(id, { authUserId, name, avatarUrl, emailVerified, lastLoginAt }) {
    const result = await query(
      `update app_users
         set auth_user_id = $2, name = $3, avatar_url = coalesce($4, avatar_url), email_verified = $5,
             last_login_at = $6::timestamptz
       where id = $1 and auth_user_id is null`,
      [id, authUserId, name, avatarUrl ?? null, Boolean(emailVerified), lastLoginAt]
    );
    return result.rowCount > 0;
  },

  async touchLogin(id, lastLoginAt) {
    await query("update app_users set last_login_at = $2::timestamptz where id = $1", [id, lastLoginAt]);
  },
};

/* ===================== saved configurations ===================== */

function configurationFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    configType: row.config_type,
    config: row.config,
    updatedAt: iso(row.updated_at),
  };
}

// The database is shared with the polyhouse planner, which saves its own setups in the same table: this app only
// ever lists, overwrites or deletes rows of its own type.
const CONFIG_TYPE = "poultry";

const configurations = {
  async listByUser(userId) {
    const { rows } = await query(
      "select id, name, config_type, config, updated_at from saved_configurations where user_id = $1 and config_type = $2 order by updated_at desc",
      [userId, CONFIG_TYPE]
    );
    return rows.map(configurationFromRow);
  },

  /**
   * Saves under (user, name); an existing config of the same type and name is overwritten. Returns null when the
   * name is taken by a setup of another type (the polyhouse planner's), which is never overwritten.
   */
  async upsert({ id, userId, name, normalizedName, configType, config, now }) {
    const { rows } = await query(
      `insert into saved_configurations (id, user_id, name, normalized_name, config_type, config, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
       on conflict (user_id, normalized_name) do update
         set name = excluded.name, config = excluded.config, updated_at = excluded.updated_at
         where saved_configurations.config_type = excluded.config_type
       returning id, name, config_type, config, updated_at, (xmax = 0) as inserted`,
      [id, userId, name, normalizedName, configType, JSON.stringify(config), iso(now)]
    );
    if (rows.length === 0) return null;
    return { ...configurationFromRow(rows[0]), created: rows[0].inserted };
  },

  async deleteForUser(id, userId) {
    if (!isUuid(id)) return false;
    const result = await query("delete from saved_configurations where id = $1 and user_id = $2 and config_type = $3", [id, userId, CONFIG_TYPE]);
    return result.rowCount > 0;
  },
};

module.exports = { CONFIG_TYPE, users, configurations, isUuid };
