// Verifies Supabase Auth access tokens by asking Supabase who they belong to. That works whatever
// signing key the project uses (legacy shared secret or asymmetric keys) and respects sign-out.
const crypto = require("crypto");

const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 500;
const cache = new Map();

function getConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  return { url, key };
}

function isSupabaseAuthConfigured() {
  const { url, key } = getConfig();
  return Boolean(url && key);
}

function remember(tokenHash, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(tokenHash, { value, expires: Date.now() + CACHE_TTL_MS });
}

function clearTokenCache() {
  cache.clear();
}

/**
 * Returns the Supabase user for an access token, or null when the token is invalid or expired.
 * Throws when Supabase cannot be reached or the backend is misconfigured, so callers answer 5xx
 * instead of wrongly telling a signed-in user their session is invalid.
 */
async function getSupabaseUser(token) {
  const { url, key } = getConfig();
  if (!url || !key) throw new Error("Supabase Auth is not configured (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const hit = cache.get(tokenHash);
  if (hit && hit.expires > Date.now()) return hit.value;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });

  if (response.status === 401 || response.status === 403) {
    cache.delete(tokenHash);
    return null;
  }
  if (!response.ok) throw new Error(`Supabase Auth answered ${response.status}`);

  const user = await response.json();
  if (!user?.id || !user?.email) return null;
  const normalized = {
    id: String(user.id),
    email: String(user.email).trim().toLowerCase(),
    emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
    name: String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim(),
    avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
  };
  remember(tokenHash, normalized);
  return normalized;
}

module.exports = { getSupabaseUser, isSupabaseAuthConfigured, clearTokenCache };
