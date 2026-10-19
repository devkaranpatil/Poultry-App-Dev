import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real backend and frontend against a dedicated
 * in-memory Postgres (PGlite) and a mock of Supabase Auth, so they never touch development or
 * production data and never send email.
 */
const API_PORT = 5391;
const WEB_PORT = 5390;
const AUTH_PORT = 5392;
const AUTH_URL = `http://localhost:${AUTH_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const AUTH_KEY = "e2e-publishable-key";
const DATABASE_URL = process.env.E2E_DATABASE_URL || "pglite:memory";
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Locally reuse the installed Chrome; CI installs Playwright's Chromium.
    channel: isCI ? undefined : "chrome",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(mobile|layout)\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "node e2e/support/mock-supabase-auth.mjs",
      url: `${AUTH_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_SUPABASE_PORT: String(AUTH_PORT), MOCK_SUPABASE_KEY: AUTH_KEY },
    },
    {
      command: "node backend/index.js",
      url: `http://localhost:${API_PORT}/api/health`,
      // Never reuse whatever already listens on the port: it may be another app.
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: "development",
        DATABASE_URL,
        SUPABASE_URL: AUTH_URL,
        SUPABASE_PUBLISHABLE_KEY: AUTH_KEY,
        CORS_ORIGINS: WEB_URL,
        AUTH_RATE_LIMIT_MAX: "1000",
        RATE_LIMIT_MAX: "5000",
        // The end-to-end tests run with the AI model "not installed", whatever is on this machine.
        LLM_MODELS_DIR: "e2e-no-models",
        AI_WARMUP: "off",
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      // Never reuse whatever already listens on the port: it may be another app.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_BASE_URL: `http://localhost:${API_PORT}`,
        VITE_SUPABASE_URL: AUTH_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: AUTH_KEY,
      },
    },
  ],
});
