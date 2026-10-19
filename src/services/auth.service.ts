import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export const GOOGLE_CALLBACK_PATH = "/oauth/google/callback";
const POST_AUTH_REDIRECT_KEY = "greenhouse.auth.redirect";

export function toAuthUser(user: User): AuthUser {
  const identities = user.identities ?? [];
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? "";
  return {
    id: user.id,
    name: String(meta.full_name || meta.name || email.split("@")[0] || ""),
    email,
    emailVerified: Boolean(user.email_confirmed_at),
    hasPassword: identities.some((identity) => identity.provider === "email"),
    googleLinked: identities.some((identity) => identity.provider === "google"),
    avatarUrl: (meta.avatar_url as string) || (meta.picture as string) || null,
    createdAt: user.created_at,
    lastLoginAt: user.last_sign_in_at ?? null,
  };
}

function assertConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error("Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.");
  }
}

export async function signup(input: { name: string; email: string; password: string }) {
  assertConfigured();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { full_name: input.name.trim() },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) throw new Error(error.message);
  // Supabase hides whether an address is already registered by returning a user with no identities.
  if (data.user && (data.user.identities ?? []).length === 0) throw new Error("Email already registered");
  return { session: data.session, needsConfirmation: !data.session };
}

export async function login(input: { email: string; password: string }) {
  assertConfigured();
  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email.trim(), password: input.password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function logout() {
  // "local" ends this browser's session only, not the user's sessions on other devices.
  await supabase.auth.signOut({ scope: "local" });
}

export async function requestPasswordReset(email: string) {
  assertConfigured();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

/** Redirect targets are remembered across the round trip to Google. */
export function rememberPostAuthRedirect(path: string) {
  try {
    window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, path);
  } catch {
    /* private mode: fall back to the default page */
  }
}

export function consumePostAuthRedirect() {
  try {
    const value = window.sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
    window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
    return value;
  } catch {
    return null;
  }
}

export async function signInWithGoogle() {
  assertConfigured();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${GOOGLE_CALLBACK_PATH}` },
  });
  if (error) throw new Error(error.message);
}

export async function linkGoogleAccount() {
  assertConfigured();
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${window.location.origin}${GOOGLE_CALLBACK_PATH}` },
  });
  if (error) throw new Error(error.message);
}

export async function unlinkGoogleAccount() {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw new Error(error.message);
  const google = data.identities.find((identity) => identity.provider === "google");
  if (!google) return;
  const result = await supabase.auth.unlinkIdentity(google);
  if (result.error) throw new Error(result.error.message);
}
