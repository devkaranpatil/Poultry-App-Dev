import { vi } from 'vitest';

/**
 * Stands in for Supabase Auth in backend tests: it answers GET /auth/v1/user for tokens it issued
 * and lets every other request through to the real fetch.
 */
export function installFakeSupabase() {
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';

  const sessions = new Map<string, Record<string, unknown>>();
  const realFetch = globalThis.fetch;
  let counter = 0;
  let failing = false;

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('http://supabase.test/auth/v1/user')) return realFetch(input, init);
    if (failing) return new Response('upstream down', { status: 503 });
    const headers = new Headers(init?.headers);
    const token = (headers.get('authorization') || '').replace(/^Bearer /, '');
    const user = sessions.get(token);
    if (!user || headers.get('apikey') !== 'test-publishable-key') return new Response('{}', { status: 401 });
    return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  return {
    /** Registers a Supabase user and returns an access token for it. */
    signIn({ email, name = '', confirmed = true, id }: { email: string; name?: string; confirmed?: boolean; id?: string }) {
      counter += 1;
      const token = `test-access-token-${counter}`;
      sessions.set(token, {
        id: id ?? `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
        email,
        email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null,
        user_metadata: name ? { full_name: name } : {},
      });
      return token;
    },
    signOut(token: string) {
      sessions.delete(token);
    },
    setOutage(value: boolean) {
      failing = value;
    },
    restore() {
      vi.unstubAllGlobals();
    },
  };
}
