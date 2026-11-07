import { expect, test } from "@playwright/test";
import { MOCK_AUTH_URL, PASSWORD, SESSION_KEY, logIn, signUp, trackPageErrors, uniqueEmail } from "./helpers";

async function signOutLocally(page: import("@playwright/test").Page) {
  await page.evaluate((key) => window.localStorage.removeItem(key), SESSION_KEY);
  await page.goto("/login");
}

test.describe("authentication", () => {
  test("signed-out visitors are sent to login", async ({ page }) => {
    await page.goto("/visualizer");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a wrong password shows an error", async ({ page }) => {
    const email = await signUp(page, uniqueEmail("wrongpw"));
    await signOutLocally(page);
    await logIn(page, email, "not-the-password");
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
  });

  test("the session survives a reload and ends on sign out", async ({ page }) => {
    await signUp(page, uniqueEmail("session"));
    await page.reload();
    await expect(page).toHaveURL(/\/visualizer/);

    await page.goto("/account");
    await page.getByRole("button", { name: "Logout" }).first().click();
    await page.goto("/visualizer");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the backend accepts the Supabase session for saved setups", async ({ page }) => {
    await signUp(page, uniqueEmail("backend"));
    const token = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}").access_token, SESSION_KEY);
    expect(token).toBeTruthy();
    const api = await page.request.get("http://localhost:5391/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(api.status()).toBe(200);
    const rejected = await page.request.get("http://localhost:5391/api/auth/me", { headers: { Authorization: "Bearer forged-token" } });
    expect(rejected.status()).toBe(401);
  });

  test("reset a forgotten password and sign in with the new one", async ({ page }) => {
    const email = await signUp(page, uniqueEmail("reset"));
    await signOutLocally(page);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("reset link is on its way");

    // Supabase would email this link; the mock lets the test pick it up instead.
    const { code } = await (await page.request.get(`${MOCK_AUTH_URL}/__test/recovery-code?email=${encodeURIComponent(email)}`)).json();
    await page.goto(`/reset-password?code=${code}`);
    await page.getByLabel("New password").fill("brand-new-pass-1");
    await page.getByLabel("Confirm password").fill("brand-new-pass-1");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("Your password has been updated.")).toBeVisible();

    await signOutLocally(page);
    await logIn(page, email, PASSWORD);
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
    await logIn(page, email, "brand-new-pass-1");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a reset page opened without the emailed link explains the problem", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  });

  test("sign in with Google from the login page", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.request.post(`${MOCK_AUTH_URL}/__test/google-email`, { data: { email: uniqueEmail("google") } });
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(errors).toEqual([]);

    await page.goto("/account");
    await expect(page.getByText("Google Grower").first()).toBeVisible();
  });

  test("Google sign-in returns to the page the visitor wanted", async ({ page }) => {
    await page.request.post(`${MOCK_AUTH_URL}/__test/google-email`, { data: { email: uniqueEmail("google-back") } });
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/account/);
  });

  test("a Google sign-in creates the matching app profile on the backend", async ({ page }) => {
    const email = uniqueEmail("google-again");
    await page.request.post(`${MOCK_AUTH_URL}/__test/google-email`, { data: { email } });
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const token = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}").access_token, SESSION_KEY);
    const me = await page.request.get("http://localhost:5391/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    expect((await me.json()).user.email).toBe(email.toLowerCase());
  });
});

test.describe("landing page", () => {
  test("renders every section without errors", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what a poultry shed will cost");
    for (const id of ["problem", "solution", "features", "ai", "workflow", "faq"]) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await page.getByRole("link", { name: "FAQ" }).first().click();
    await expect(page).toHaveURL(/#faq$/);
    expect(errors).toEqual([]);
  });

  test("the header Sign Up opens sign-up", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Sign Up/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("the main button goes to the estimate without asking for an account", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Try a free estimate/ }).click();
    await expect(page).toHaveURL(/\/estimate$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
