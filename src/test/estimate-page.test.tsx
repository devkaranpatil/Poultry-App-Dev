import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleResult } from './helpers/poultryResult';
import { I18nProvider } from '@/context/I18nContext';
import { AuthProvider } from '@/context/AuthContext';
import Estimate from '@/pages/Estimate';
import { authMock } from './helpers/mockSupabase';
import * as calculationService from '@/services/calculation.service';

vi.mock('@/lib/supabase', async () => (await import('./helpers/mockSupabase')).supabaseModule);
vi.mock('@/services/calculation.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/calculation.service')>();
  return { ...actual, calculateFarm: vi.fn() };
});

const calc = vi.mocked(calculationService);

function renderPage() {
  window.localStorage.setItem('farm.locale', 'en');
  return render(
    <MemoryRouter initialEntries={['/estimate']}>
      <I18nProvider>
        <AuthProvider>
          <Estimate />
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.reset();
  window.localStorage.clear();
});

describe('Estimate (no account)', () => {
  it('shows base, downside and upside from the calculator without a sign-in, and asks for an account only to save', async () => {
    calc.calculateFarm.mockResolvedValue(sampleResult());
    renderPage();

    const cases = await screen.findByTestId('estimate-cases');
    expect(cases).toHaveTextContent('Downside');
    expect(cases).toHaveTextContent('Base case');
    expect(cases).toHaveTextContent('Upside');
    // One base call and one call each for the downside and the upside, all against the public calculator.
    await waitFor(() => expect(calc.calculateFarm).toHaveBeenCalledTimes(3));
    // One button on wide screens and one fixed at the bottom on phones; CSS shows one of them.
    expect(screen.getAllByRole('button', { name: /Save and refine/ }).length).toBeGreaterThan(0);
    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();
  });

  it('warns when the base case loses money', async () => {
    const result = sampleResult();
    calc.calculateFarm.mockResolvedValue({ ...result, returns: { ...result.returns, annualProfit: -150000, paybackYears: null } });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/loses/);
  });

  it('recalculates when a price is edited, sending the edit as an assumption', async () => {
    calc.calculateFarm.mockResolvedValue(sampleResult());
    renderPage();
    const input = await screen.findByLabelText(/Live-bird price/);
    calc.calculateFarm.mockClear();
    fireEvent.change(input, { target: { value: '120' } });
    await waitFor(() => expect(calc.calculateFarm).toHaveBeenCalled(), { timeout: 3000 });
    expect(calc.calculateFarm.mock.calls[0][1]).toMatchObject({ saleInrPerKg: 120 });
  });

  it('says so when the planner cannot be reached', async () => {
    calc.calculateFarm.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText(/Could not reach the planner/)).toBeInTheDocument();
  });
});
