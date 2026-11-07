import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_CONFIG, sampleResult } from './helpers/poultryResult';
import { I18nProvider } from '@/context/I18nContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/auth/LoginPage';
import Landing from '@/pages/Landing';
import Index from '@/pages/Index';
import { saveDraft } from '@/lib/configPersistence';
import { authMock, makeSession, supabaseModule } from './helpers/mockSupabase';
import * as calculationService from '@/services/calculation.service';

vi.mock('@/lib/supabase', async () => (await import('./helpers/mockSupabase')).supabaseModule);
vi.mock('@/services/calculation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/calculation.service')>();
  return { ...actual, calculateFarm: vi.fn() };
});
vi.mock('@/services/ai.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ai.service')>();
  return { ...actual, getAiStatus: vi.fn().mockResolvedValue({ enabled: false, model: null }) };
});
// WebGL is unavailable in jsdom; the 3D viewer is covered by the Playwright suite.
vi.mock('@/components/farm/MiddlePanel', () => ({ MiddlePanel: () => <div data-testid="viewer" /> }));

const supa = vi.mocked(supabaseModule.supabase.auth);
const calc = vi.mocked(calculationService);
function wrap(ui: React.ReactElement, path = '/') {
  window.localStorage.setItem('farm.locale', 'en');
  return render(
    <MemoryRouter initialEntries={[path]}>
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
});

describe('AuthContext', () => {
  function Probe() {
    const { user: current, isAuthenticated, isLoading, login, logout } = useAuth();
    if (isLoading) return <p>loading</p>;
    return (
      <div>
        <p>{isAuthenticated ? `in:${current?.name}` : 'out'}</p>
        <button type="button" onClick={() => void login('asha@example.test', 'pw')}>login</button>
        <button type="button" onClick={logout}>logout</button>
      </div>
    );
  }

  it('logs in and logs out', async () => {
    supa.signInWithPassword.mockResolvedValue({ data: { session: makeSession() }, error: null } as never);
    wrap(<Probe />);
    const loginButton = await screen.findByRole('button', { name: 'login' });
    await act(async () => fireEvent.click(loginButton));
    expect(await screen.findByText('in:Asha Patil')).toBeInTheDocument();
    expect(supa.signInWithPassword).toHaveBeenCalledWith({ email: 'asha@example.test', password: 'pw' });

    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    expect(screen.getByText('out')).toBeInTheDocument();
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('restores a stored session and stays signed out without one', async () => {
    authMock.setSession(makeSession());
    const { unmount } = wrap(<Probe />);
    expect(await screen.findByText('in:Asha Patil')).toBeInTheDocument();
    unmount();

    authMock.setSession(null);
    wrap(<Probe />);
    expect(await screen.findByText('out')).toBeInTheDocument();
  });

  it('follows sign-in and sign-out that happen elsewhere (another tab, token refresh)', async () => {
    wrap(<Probe />);
    expect(await screen.findByText('out')).toBeInTheDocument();
    await act(async () => authMock.setSession(makeSession({ name: 'Ravi' })));
    expect(await screen.findByText('in:Ravi')).toBeInTheDocument();
    await act(async () => authMock.setSession(null));
    expect(await screen.findByText('out')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  it('shows the server error when login fails', async () => {
    supa.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid credentials' } } as never);
    wrap(<LoginPage />, '/login');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'asha@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('goes to the workspace after a successful login', async () => {
    supa.signInWithPassword.mockResolvedValue({ data: { session: makeSession() }, error: null } as never);
    wrap(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>workspace</p>} />
      </Routes>,
      '/login'
    );
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'asha@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('workspace')).toBeInTheDocument();
  });
});

describe('Landing', () => {
  it('renders the key sections, offers the estimate first and opens sign-up from the header', async () => {
    calc.calculateFarm.mockResolvedValue(sampleResult());
    wrap(<Landing />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Know what a poultry shed will cost');
    for (const id of ['questions', 'how-it-works', 'bank', 'birds', 'ai', 'faq']) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    // The main call to action needs no account.
    // Every start action on the page has the same label and goes to the estimate.
    for (const link of screen.getAllByRole('link', { name: /Try a free estimate/ })) expect(link).toHaveAttribute('href', '/estimate');
    fireEvent.click(screen.getAllByRole('button', { name: /Sign up/i })[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows the example from the calculator, labelled with its assumptions, and a loss as a loss', async () => {
    const result = sampleResult();
    calc.calculateFarm.mockResolvedValue({ ...result, returns: { ...result.returns, annualProfit: -193935, paybackYears: null } });
    wrap(<Landing />);
    const card = await screen.findByTestId('example-estimate');
    await waitFor(() => expect(card).toHaveTextContent('-₹1.94 L'));
    expect(card).toHaveTextContent('Does not pay back');
    expect(card).toHaveTextContent('not a quote');
    expect(calc.calculateFarm.mock.calls[0][0]).toMatchObject({ state: 'Maharashtra', district: 'Pune' });
  });

  it('hides the numbers when the calculator is unreachable', async () => {
    calc.calculateFarm.mockRejectedValue(new Error('offline'));
    wrap(<Landing />);
    expect(await screen.findByText(/example could not be loaded/i)).toBeInTheDocument();
  });
});

describe('Workspace (Index)', () => {
  // The real calculation for a Nagpur broiler shed, as the server would send it.
  const result = sampleResult();

  it('restores the saved draft and calculates it automatically', async () => {
    authMock.setSession(makeSession());
    calc.calculateFarm.mockResolvedValue(result);
    saveDraft(SAMPLE_CONFIG);

    wrap(<Index />, '/visualizer');

    expect(await screen.findByText('Nagpur, Maharashtra')).toBeInTheDocument();
    await waitFor(() => expect(calc.calculateFarm).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(calc.calculateFarm.mock.calls[0][0]).toMatchObject({ state: 'Maharashtra', district: 'Nagpur' });
    // The status says the figures are current; the figures themselves are on the money steps.
    expect(await screen.findByText('Up to date')).toBeInTheDocument();
  });

  it('copies a share link for the current setup', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    saveDraft(SAMPLE_CONFIG);
    calc.calculateFarm.mockResolvedValue(result);

    wrap(<Index />, '/visualizer');
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/\/visualizer\?setup=[A-Za-z0-9_-]+$/);
  });
});
