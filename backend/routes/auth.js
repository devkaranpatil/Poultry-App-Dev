const crypto = require("crypto");
const express = require("express");
const { users } = require("../repositories");
const { getSupabaseUser } = require("../services/supabaseAuth");
const { success, failure } = require("../utils/response");

const router = express.Router();

function isDuplicateKeyError(error) {
  return error && typeof error === "object" && error.code === "23505";
}

function sanitizeUser(user) {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

/**
 * Finds the app profile for a Supabase user, creating or linking it on first sight.
 *
 * An existing profile with the same email is adopted only when Supabase says that email is
 * confirmed; otherwise anyone could register someone else's address and inherit their saved data.
 */
async function resolveProfile(authUser) {
  const now = new Date().toISOString();
  const fallbackName = authUser.name || authUser.email.split("@")[0];

  const linked = await users.findByAuthUserId(authUser.id);
  if (linked) {
    await users.touchLogin(linked.id, now);
    return { ...linked, lastLoginAt: now };
  }

  const sameEmail = await users.findByEmail(authUser.email);
  if (sameEmail && !sameEmail.authUserId) {
    if (!authUser.emailConfirmed) return null;
    const patch = {
      authUserId: authUser.id,
      name: authUser.name || sameEmail.name || fallbackName,
      avatarUrl: authUser.avatarUrl,
      emailVerified: true,
      lastLoginAt: now,
    };
    if (await users.linkAuthUser(sameEmail.id, patch)) {
      return { ...sameEmail, ...patch };
    }
    return resolveProfile(authUser);
  }
  if (sameEmail) return null; // that address belongs to a different Supabase user

  const created = {
    id: crypto.randomUUID(),
    authUserId: authUser.id,
    name: fallbackName,
    email: authUser.email,
    avatarUrl: authUser.avatarUrl,
    emailVerified: authUser.emailConfirmed,
    createdAt: now,
    lastLoginAt: now,
  };
  try {
    await users.insert(created);
  } catch (err) {
    // A parallel first request created the profile; use it.
    if (isDuplicateKeyError(err)) return resolveProfile(authUser);
    throw err;
  }
  return created;
}

async function requireAuth(req, res, next) {
  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (!token) return failure(res, "Missing auth token", 401, undefined, req);

  try {
    const authUser = await getSupabaseUser(token);
    if (!authUser) return failure(res, "Invalid or expired auth token", 401, undefined, req);

    const profile = await resolveProfile(authUser);
    if (!profile) return failure(res, "This email is already registered to another account", 409, undefined, req);

    req.user = profile;
    req.authToken = token;
    return next();
  } catch (err) {
    console.error("Auth lookup error", err);
    return failure(res, "Unable to verify auth token", 500, undefined, req);
  }
}

// Signup, login, Google sign-in and password reset all happen in the browser against Supabase Auth.
// The backend only verifies the resulting session and keeps the app profile.
router.get("/me", requireAuth, async (req, res) => {
  return success(res, { user: sanitizeUser(req.user) }, 200, req);
});

module.exports = router;
module.exports.requireAuth = requireAuth;
