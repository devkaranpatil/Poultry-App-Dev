// A small stand-in for Supabase Auth (GoTrue) so the browser tests exercise the real supabase-js
// client without sending email or touching the cloud project. It implements only what the app uses:
// email sign-up and sign-in, token refresh, the PKCE code exchange, the Google redirect, password
// recovery, user lookup/update and sign-out. Test-only controls live under /__test.
import crypto from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 5392);
const PUBLISHABLE_KEY = process.env.MOCK_SUPABASE_KEY || "e2e-publishable-key";

const users = new Map(); // id -> user record (with password)
const byEmail = new Map(); // email -> id
const tokens = new Map(); // access token -> user id
const refreshTokens = new Map(); // refresh token -> user id
const codes = new Map(); // pkce code -> { userId }
const recoveryCodes = new Map(); // email -> code
let nextGoogleEmail = "google-grower@example.test";

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function identity(user, provider) {
  return {
    identity_id: crypto.randomUUID(),
    id: user.id,
    user_id: user.id,
    identity_data: { email: user.email, sub: user.id },
    provider,
    created_at: user.created_at,
    last_sign_in_at: user.created_at,
    updated_at: user.created_at,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: user.created_at,
    confirmed_at: user.created_at,
    phone: "",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: user.providers[0], providers: user.providers },
    user_metadata: user.metadata,
    identities: user.providers.map((provider) => identity(user, provider)),
    created_at: user.created_at,
    updated_at: new Date().toISOString(),
  };
}

function createUser({ email, password, metadata = {}, provider }) {
  const user = {
    id: crypto.randomUUID(),
    email: email.trim().toLowerCase(),
    password: password ?? null,
    metadata,
    providers: [provider],
    created_at: new Date().toISOString(),
  };
  users.set(user.id, user);
  byEmail.set(user.email, user.id);
  return user;
}

function sessionFor(user) {
  const expiresIn = 3600;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;
  const accessToken = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    exp,
    jti: crypto.randomUUID(),
  })}.mock-signature`;
  const refreshToken = crypto.randomBytes(12).toString("hex");
  tokens.set(accessToken, user.id);
  refreshTokens.set(refreshToken, user.id);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: exp,
    refresh_token: refreshToken,
    user: publicUser(user),
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

const fail = (res, status, code, message) => send(res, status, { code: status, error_code: code, msg: message, message });

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function userFromRequest(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  const id = tokens.get(token);
  return id ? users.get(id) : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return send(res, 204);

  try {
    if (url.pathname === "/health") return send(res, 200, { ok: true });

    // ---- test controls -------------------------------------------------------------------
    if (url.pathname === "/__test/google-email" && req.method === "POST") {
      nextGoogleEmail = String((await readJson(req)).email).toLowerCase();
      return send(res, 200, { email: nextGoogleEmail });
    }
    if (url.pathname === "/__test/recovery-code") {
      const code = recoveryCodes.get(String(url.searchParams.get("email")).toLowerCase());
      return code ? send(res, 200, { code }) : fail(res, 404, "not_found", "No recovery was requested");
    }

    if (!url.pathname.startsWith("/auth/v1/")) return fail(res, 404, "not_found", "Not found");
    if (url.pathname !== "/auth/v1/authorize" && req.headers.apikey !== PUBLISHABLE_KEY) {
      return fail(res, 401, "invalid_api_key", "Invalid API key");
    }
    const route = url.pathname.slice("/auth/v1".length);

    if (route === "/signup" && req.method === "POST") {
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || String(body.password || "").length < 8) return fail(res, 422, "weak_password", "Password should be at least 8 characters.");
      if (byEmail.has(email)) {
        // Real Supabase hides repeat sign-ups: a user without identities and no session.
        return send(res, 200, { ...publicUser(users.get(byEmail.get(email))), identities: [] });
      }
      const user = createUser({ email, password: body.password, metadata: body.data || {}, provider: "email" });
      return send(res, 200, sessionFor(user));
    }

    if (route === "/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      const body = await readJson(req);
      if (grant === "password") {
        const user = users.get(byEmail.get(String(body.email || "").trim().toLowerCase()));
        if (!user || user.password !== body.password) return fail(res, 400, "invalid_credentials", "Invalid login credentials");
        return send(res, 200, sessionFor(user));
      }
      if (grant === "refresh_token") {
        const id = refreshTokens.get(body.refresh_token);
        return id ? send(res, 200, sessionFor(users.get(id))) : fail(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
      }
      if (grant === "pkce") {
        const entry = codes.get(body.auth_code);
        if (!entry) return fail(res, 400, "flow_state_not_found", "invalid flow state, no valid flow state found");
        codes.delete(body.auth_code);
        return send(res, 200, sessionFor(users.get(entry.userId)));
      }
      return fail(res, 400, "unsupported_grant_type", "Unsupported grant type");
    }

    if (route === "/user" && req.method === "GET") {
      const user = userFromRequest(req);
      return user ? send(res, 200, publicUser(user)) : fail(res, 401, "bad_jwt", "invalid JWT");
    }

    if (route === "/user" && req.method === "PUT") {
      const user = userFromRequest(req);
      if (!user) return fail(res, 401, "bad_jwt", "invalid JWT");
      const body = await readJson(req);
      if (body.password !== undefined) {
        if (String(body.password).length < 8) return fail(res, 422, "weak_password", "Password should be at least 8 characters.");
        user.password = body.password;
        if (!user.providers.includes("email")) user.providers.push("email");
      }
      if (body.data) user.metadata = { ...user.metadata, ...body.data };
      return send(res, 200, publicUser(user));
    }

    if (route === "/recover" && req.method === "POST") {
      const email = String((await readJson(req)).email || "").trim().toLowerCase();
      // Like Supabase, answer the same way whether or not the address exists.
      if (byEmail.has(email)) {
        const code = crypto.randomUUID();
        recoveryCodes.set(email, code);
        codes.set(code, { userId: byEmail.get(email) });
      }
      return send(res, 200, {});
    }

    if (route === "/logout" && req.method === "POST") {
      const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
      tokens.delete(token);
      return send(res, 204);
    }

    if (route === "/authorize" && req.method === "GET") {
      const redirectTo = url.searchParams.get("redirect_to");
      if (url.searchParams.get("provider") !== "google" || !redirectTo) return fail(res, 400, "validation_failed", "Unsupported provider");
      let id = byEmail.get(nextGoogleEmail);
      let user = id ? users.get(id) : null;
      if (!user) user = createUser({ email: nextGoogleEmail, metadata: { full_name: "Google Grower", avatar_url: null }, provider: "google" });
      else if (!user.providers.includes("google")) user.providers.push("google");
      const code = crypto.randomUUID();
      codes.set(code, { userId: user.id });
      res.writeHead(302, { Location: `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}code=${code}` });
      return res.end();
    }

    return fail(res, 404, "not_found", `No mock for ${req.method} ${route}`);
  } catch (error) {
    return fail(res, 500, "unexpected_failure", String(error));
  }
});

server.listen(PORT, () => console.log(`Mock Supabase Auth listening on http://localhost:${PORT}`));
