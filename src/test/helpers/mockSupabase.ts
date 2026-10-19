import { vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type Listener = (event: string, session: Session | null) => void;

const listeners = new Set<Listener>();
let current: Session | null = null;

/** Drives the fake Supabase client used by frontend tests (see vi.mock of '@/lib/supabase'). */
export const authMock = {
  /** Sets the session the app finds on load, and notifies anyone already listening. */
  setSession(session: Session | null) {
    current = session;
    listeners.forEach((listener) => listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
  },
  reset() {
    current = null;
    listeners.clear();
  },
};

export function makeSession({
  email = 'asha@example.test',
  name = 'Asha Patil',
  providers = ['email'],
}: { email?: string; name?: string; providers?: string[] } = {}): Session {
  const user = {
    id: 'u1',
    aud: 'authenticated',
    email,
    app_metadata: {},
    user_metadata: { full_name: name },
    created_at: '2026-01-01T00:00:00Z',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: null,
    identities: providers.map((provider) => ({
      provider,
      id: provider,
      user_id: 'u1',
      identity_id: provider,
      identity_data: {},
      created_at: '',
      last_sign_in_at: '',
      updated_at: '',
    })),
  };
  return {
    access_token: 'tok',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  } as unknown as Session;
}

const ok = { data: {}, error: null };

export const supabaseModule = {
  isSupabaseConfigured: true,
  wasRecoveryDetected: () => false,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: current } })),
      onAuthStateChange: vi.fn((callback: Listener) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      }),
      getUser: vi.fn(async () => ({ data: { user: current?.user ?? null } })),
      signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: { message: 'not mocked' } })),
      signUp: vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'not mocked' } })),
      signOut: vi.fn(async () => {
        authMock.setSession(null);
        return { error: null };
      }),
      signInWithOAuth: vi.fn(async () => ok),
      linkIdentity: vi.fn(async () => ok),
      unlinkIdentity: vi.fn(async () => ok),
      getUserIdentities: vi.fn(async () => ({ data: { identities: current?.user.identities ?? [] }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ok),
      updateUser: vi.fn(async () => ok),
    },
  },
};
