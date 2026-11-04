const express = require("express");
const cors = require("cors");
const path = require("path");

const farmRoutes = require("./routes/farm");
const locationRoutes = require("./routes/location");
const healthRoutes = require("./routes/health");
const authRoutes = require("./routes/auth");
const configurationRoutes = require("./routes/configurations");
const aiRoutes = require("./routes/ai");
const riskRoutes = require("./routes/risk");
const { requestMeta } = require("./middleware/requestMeta");
const { createRateLimiter } = require("./middleware/rateLimit");
const { success, failure } = require("./utils/response");
const { isSupabaseAuthConfigured } = require("./services/supabaseAuth");

const app = express();
const pkg = require("./package.json");
const isProduction = String(process.env.NODE_ENV || "development").toLowerCase() === "production";

app.set("trust proxy", 1);

const allowedOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must be configured in production");
}

if (!isSupabaseAuthConfigured()) {
  if (isProduction) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured");
  }
  console.warn("Auth: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set; signed-in requests will fail.");
}

app.use(requestMeta);
app.use(
  createRateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_LIMIT_MAX || 120),
  })
);

// Served before CORS: static assets, and browsers send an Origin header on same-origin module scripts.
// 3D "API Studio": an animated broiler shed scene driven by live /api/health data.
app.use("/studio/vendor", express.static(path.join(__dirname, "node_modules", "three", "build")));
app.use("/studio", express.static(path.join(__dirname, "studio")));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (!isProduction && allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error("Not allowed by CORS");
      error.status = 403;
      return callback(error);
    },
  })
);

app.use(express.json({ limit: process.env.JSON_LIMIT || "1mb" }));

// Baseline security/perf headers without extra dependencies.
app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("cache-control", "no-store");
  next();
});

app.get("/", (req, res) => {
  return success(
    res,
    {
      message: "Backend is running",
      docsHint: "Use /api/health or /api/farm/* endpoints",
    },
    200,
    req
  );
});

app.get("/api/meta", (req, res) => {
  return success(
    res,
    {
      service: "farm-backend",
      version: pkg.version,
      environment: process.env.NODE_ENV || "development",
      rateLimit: {
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
        max: Number(process.env.RATE_LIMIT_MAX || 120),
      },
    },
    200,
    req
  );
});

app.use("/api/health", healthRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/farm", farmRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/configurations", configurationRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/risk", riskRoutes);

app.use((req, res) => {
  return failure(res, "Route not found", 404, { path: req.originalUrl }, req);
});

app.use((err, req, res, next) => {
  // Client errors raised by middleware (CORS rejection, malformed or oversized
  // JSON bodies) carry their own 4xx status and a message safe to return.
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500) {
    const message = err.type === "entity.parse.failed" ? "Malformed JSON body" : err.message;
    return failure(res, message, status, undefined, req);
  }

  console.error("Server Error:", err);
  return failure(res, "Internal server error", 500, undefined, req);
});

module.exports = app;
