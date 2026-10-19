import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/context/I18nContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/auth/LoginPage';
import Landing from '@/pages/Landing';
import Index from '@/pages/Index';
import { saveDraft } from '@/lib/configPersistence';
import { DEFAULT_CONFIG } from '@/types/farm';
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
  it('renders the key sections and opens sign-up from the hero', async () => {
    wrap(<Landing />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Know what a greenhouse will cost');
    for (const id of ['problem', 'solution', 'features', 'ai', 'workflow', 'faq']) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: /Get Started/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Workspace (Index)', () => {
  const result = {
    area: 300, volume: 1500,
    climate: { climateZone: 'Tropical Coastal', avgTemperature: 27, humidity: 78, rainfall: 2900, climateFactor: 1.05, advisories: [] },
    cost: {
      structureCost: 255000, coverCost: 36000, ventilationCost: 13500, foundationCost: 54000, irrigationCost: 16500,
      electricalCost: 0, laborCost: 86250, miscCost: 10500, totalCost: 495338, costPerSqm: 1651, climateAdjustment: 0.05,
    },
    crops: [], selectedCrop: null, irrigation: { system: 'drip' as const, ratePerSqm: 55, notes: [] },
  };

  it('restores the saved draft and calculates it automatically', async () => {
    authMock.setSession(makeSession());
    calc.calculateFarm.mockResolvedValue(result);
    saveDraft({ ...DEFAULT_CONFIG, state: 'Goa', district: 'North Goa' });

    wrap(<Index />, '/visualizer');

    expect(await screen.findByText('North Goa, Goa')).toBeInTheDocument();
    await waitFor(() => expect(calc.calculateFarm).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(calc.calculateFarm.mock.calls[0][0]).toMatchObject({ state: 'Goa', district: 'North Goa' });
    expect(await screen.findByText('₹4.95 L')).toBeInTheDocument();
  });

  it('copies a share link for the current setup', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    saveDraft({ ...DEFAULT_CONFIG, state: 'Goa', district: 'North Goa' });
    calc.calculateFarm.mockResolvedValue(result);

    wrap(<Index />, '/visualizer');
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/\/visualizer\?setup=[A-Za-z0-9_-]+$/);
  });
});
