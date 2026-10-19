import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/context/I18nContext';
import { AuthProvider } from '@/context/AuthContext';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import GoogleCallbackPage from '@/pages/auth/GoogleCallbackPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import {
  consumePostAuthRedirect,
  linkGoogleAccount,
  logout,
  rememberPostAuthRedirect,
  requestPasswordReset,
  signInWithGoogle,
  signup,
  toAuthUser,
  unlinkGoogleAccount,
} from '@/services/auth.service';
import { authMock, makeSession, supabaseModule } from './helpers/mockSupabase';

vi.mock('@/lib/supabase', async () => (await import('./helpers/mockSupabase')).supabaseModule);

const supa = vi.mocked(supabaseModule.supabase.auth);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.reset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem('farm.locale', 'en');
});

describe('auth.service', () => {
  it('describes the signed-in user from the Supabase identities', () => {
    const session = makeSession({ providers: ['email', 'google'] });
    expect(toAuthUser(session.user)).toMatchObject({
      name: 'Asha Patil',
      email: 'asha@example.test',
      emailVerified: true,
      hasPassword: true,
      googleLinked: true,
    });
    const googleOnly = toAuthUser(makeSession({ providers: ['google'] }).user);
    expect(googleOnly.hasPassword).toBe(false);
    expect(googleOnly.googleLinked).toBe(true);
  });

  it('sends the name, the confirmation redirect and reports when the email must be confirmed', async () => {
    supa.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null } as never);
    const result = await signup({ name: ' Asha ', email: ' asha@example.test ', password: 'long-enough-1' });
    expect(result.needsConfirmation).toBe(true);
    expect(supa.signUp).toHaveBeenCalledWith({
      email: 'asha@example.test',
      password: 'long-enough-1',
      options: { data: { full_name: 'Asha' }, emailRedirectTo: `${window.location.origin}/login` },
    });
  });

  it('refuses an address that is already registered', async () => {
    // Supabase answers a repeat signup with a user that has no identities.
    supa.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null } as never);
    await expect(signup({ name: 'A', email: 'a@example.test', password: 'long-enough-1' })).rejects.toThrow(/already registered/);
  });

  it('asks Supabase to email a reset link that returns to this app', async () => {
    await requestPasswordReset('asha@example.test');
    expect(supa.resetPasswordForEmail).toHaveBeenCalledWith('asha@example.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it('starts Google sign-in and linking with the callback route', async () => {
    await signInWithGoogle();
    expect(supa.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/oauth/google/callback` },
    });
    await linkGoogleAccount();
    expect(supa.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/oauth/google/callback` },
    });
  });

  it('unlinks only the Google identity and signs out of this browser only', async () => {
    authMock.setSession(makeSession({ providers: ['email', 'google'] }));
    await unlinkGoogleAccount();
    expect(supa.unlinkIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' }));
    await logout();
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('remembers where to go after the round trip to Google, once', () => {
    rememberPostAuthRedirect('/visualizer?setup=abc');
    expect(consumePostAuthRedirect()).toBe('/visualizer?setup=abc');
    expect(consumePostAuthRedirect()).toBeNull();
  });
});

function renderAt(path: string, ui: React.ReactElement, route = path.split('?')[0]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <AuthProvider>
          <Routes>
            <Route path={route} element={ui} />
            <Route path="/dashboard" element={<p>workspace</p>} />
            <Route path="/account" element={<p>account page</p>} />
          </Routes>
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('ForgotPasswordPage', () => {
  it('gives the same confirmation for any address', async () => {
    renderAt('/forgot-password', <ForgotPasswordPage />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'nobody@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: /reset link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/reset link is on its way/i);
  });
});

describe('ResetPasswordPage', () => {
  it('rejects a visit that did not come from the emailed link', async () => {
    renderAt('/reset-password', <ResetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});

describe('GoogleCallbackPage', () => {
  it('sends a signed-in user on to where they were going', async () => {
    authMock.setSession(makeSession({ providers: ['google'] }));
    rememberPostAuthRedirect('/account');
    renderAt('/oauth/google/callback?code=abc', <GoogleCallbackPage />);
    expect(await screen.findByText('account page')).toBeInTheDocument();
  });

  it('defaults to the dashboard', async () => {
    authMock.setSession(makeSession({ providers: ['google'] }));
    renderAt('/oauth/google/callback?code=abc', <GoogleCallbackPage />);
    expect(await screen.findByText('workspace')).toBeInTheDocument();
  });

  it('shows the provider error instead of redirecting', async () => {
    renderAt('/oauth/google/callback?error=access_denied&error_description=User+denied+access', <GoogleCallbackPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/User denied access/);
    await waitFor(() => expect(screen.queryByText('workspace')).not.toBeInTheDocument());
  });

  it('fails clearly when no session arrives', async () => {
    renderAt('/oauth/google/callback', <GoogleCallbackPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
