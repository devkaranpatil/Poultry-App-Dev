import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';
import { I18nProvider } from '@/context/I18nContext';
import { AuthProvider } from '@/context/AuthContext';
import SignupPage from '@/pages/auth/SignupPage';
import AccountPage from '@/pages/auth/AccountPage';
import { captureModelSnapshot, registerModelSnapshot } from '@/lib/modelSnapshot';
import { useAnimatedScale } from '@/hooks/useAnimations';
import { authMock, makeSession, supabaseModule } from './helpers/mockSupabase';

vi.mock('@/lib/supabase', async () => (await import('./helpers/mockSupabase')).supabaseModule);
vi.mock('@/services/ai.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai.service')>();
  return { ...actual, getAiStatus: vi.fn().mockResolvedValue({ enabled: false, model: null }) };
});
vi.mock('@/components/farm/MiddlePanel', () => ({ MiddlePanel: () => <div data-testid="viewer" /> }));

const supa = vi.mocked(supabaseModule.supabase.auth);

function renderAppAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

function wrap(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <AuthProvider>{ui}</AuthProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.reset();
  window.localStorage.clear();
  window.localStorage.setItem('farm.locale', 'en');
});

describe('App routing', () => {
  it('sends signed-out visitors from the workspace to login', async () => {
    renderAppAt('/visualizer');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('lets signed-in users into the workspace', async () => {
    authMock.setSession(makeSession());
    renderAppAt('/visualizer');
    expect(await screen.findByText("Project setup", {}, { timeout: 8000 })).toBeInTheDocument();
  });

  it('keeps signed-in users away from the login page', async () => {
    authMock.setSession(makeSession());
    renderAppAt('/login');
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });

  it('renders a 404 page for unknown routes', async () => {
    renderAppAt('/no-such-page');
    expect(await screen.findByText('404')).toBeInTheDocument();
  });

  it('renders the support page', async () => {
    renderAppAt('/support');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

describe('SignupPage', () => {
  it('shows validation feedback from the server', async () => {
    supa.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Email already registered' } } as never);
    wrap(<SignupPage />);
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
  });
});

describe('AccountPage', () => {
  it('blocks unlinking Google when the account has no password', async () => {
    authMock.setSession(makeSession({ providers: ['google'] }));
    wrap(<AccountPage />);
    const unlink = await screen.findByRole('button', { name: /Unlink Google/i });
    expect(unlink).toBeDisabled();
    expect(unlink).toHaveAttribute('title', expect.stringMatching(/Set a password/));
  });
});

describe('model snapshot registry', () => {
  it('returns the registered capture and null after unregistering', () => {
    expect(captureModelSnapshot()).toBeNull();
    const unregister = registerModelSnapshot(() => 'data:image/jpeg;base64,AA');
    expect(captureModelSnapshot()).toBe('data:image/jpeg;base64,AA');
    unregister();
    expect(captureModelSnapshot()).toBeNull();
  });

  it('swallows capture failures', () => {
    const unregister = registerModelSnapshot(() => {
      throw new Error('WebGL context lost');
    });
    expect(captureModelSnapshot()).toBeNull();
    unregister();
  });
});

describe('useAnimatedScale', () => {
  it('settles on the target and stops animating', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const { result } = renderHook(() => useAnimatedScale(1, 0.2));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(1);
    vi.useRealTimers();
  });
});
