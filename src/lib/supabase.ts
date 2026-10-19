import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const isSupabaseConfigured = Boolean(url && key);

// PKCE keeps OAuth and password-recovery codes useless to anyone who only sees the redirect URL.
// The placeholders only let the app load (and show a clear error on sign-in) when the env is missing.
export const supabase = createClient(url || "http://localhost:54321", key || "missing-publishable-key", {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "greenhouse.auth.session",
  },
});

// The recovery event fires while the client exchanges the emailed ?code=, which can happen before
// React has subscribed. Listening here, at module load, makes sure it is never missed.
let recoveryDetected = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") recoveryDetected = true;
  if (event === "SIGNED_OUT") recoveryDetected = false;
});

export function wasRecoveryDetected() {
  return recoveryDetected;
}
