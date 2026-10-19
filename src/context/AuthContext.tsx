import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, wasRecoveryDetected } from "@/lib/supabase";
import {
  login as loginRequest,
  logout as logoutRequest,
  signup as signupRequest,
  toAuthUser,
  type AuthUser,
} from "@/services/auth.service";

interface AuthContextValue {
  user: AuthUser | null;
  /** Supabase access token; sent to the backend as a Bearer token. */
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** True after the user opened a password-recovery link and has not yet chosen a new password. */
  isRecovery: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Resolves with needsConfirmation when Supabase wants the email confirmed before signing in. */
  signup: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  finishRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    let active = true;

    // Keep this callback synchronous: awaiting Supabase calls inside it can deadlock the client.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
      if (event === "SIGNED_OUT") setIsRecovery(false);
    });

    // getSession waits for a pending ?code= exchange (OAuth or recovery link) before answering.
    supabase.auth
      .getSession()
      .then(({ data: current }) => {
        if (!active) return;
        setSession(current.session);
        if (wasRecoveryDetected()) setIsRecovery(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const next = await loginRequest({ email, password });
    setSession(next);
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const result = await signupRequest({ name, email, password });
    if (result.session) setSession(result.session);
    return { needsConfirmation: result.needsConfirmation };
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setIsRecovery(false);
    void logoutRequest();
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) setSession((current) => (current ? { ...current, user: data.user } : current));
  }, []);

  const finishRecovery = useCallback(() => setIsRecovery(false), []);

  const user = useMemo(() => (session ? toAuthUser(session.user) : null), [session]);
  const token = session?.access_token ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      isRecovery,
      login,
      signup,
      logout,
      refreshUser,
      finishRecovery,
    }),
    [user, token, isLoading, isRecovery, login, signup, logout, refreshUser, finishRecovery]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
