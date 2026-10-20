import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { RiskPanel } from '@/components/farm/RiskPanel';
import { useRiskSimulation, verdictFor } from '@/hooks/useRiskSimulation';
import { I18nProvider } from '@/context/I18nContext';
import { DEFAULT_CONFIG, type FarmConfig } from '@/types/farm';
import type { RiskResult } from '@/services/risk.service';

const result: RiskResult = {
  simulation: {
    trials: 5000,
    years: 5,
    npv: { p10: -120000, p50: 40000, p90: 210000 },
    paybackYears: { p10: 3.1, p50: 4.4, p90: null },
    annualProfit: { p10: 60000, p50: 90000, p90: 120000 },
    probabilities: { loss: 0.32, paybackWithin: { 3: 0.12, 5: 0.58 }, outbreakYear: 0.02 },
    histogram: [
      { from: -200000, to: -100000, count: 900 },
      { from: -100000, to: 0, count: 700 },
      { from: 0, to: 100000, count: 2000 },
      { from: 100000, to: 300000, count: 1400 },
    ],
    drivers: [
      { driver: 'salePrice', npvAtP10: -80000, npvAtP90: 160000, range: 240000 },
      { driver: 'mortality', npvAtP10: 100000, npvAtP90: -20000, range: 120000 },
      { driver: 'outbreak', npvAtP10: 40000, npvAtP90: -20000, range: 60000 },
      { driver: 'buildCost', npvAtP10: 60000, npvAtP90: 20000, range: 40000 },
    ],
    assumptions: {
      mortalityRangePct: [3, 5, 12],
      conversionRange: [1.65, 1.8, 2],
      salePriceSigmaLog: 0.2,
      feedPriceBandPct: 10,
      outbreakChancePct: 2,
      costBand: 0.1,
      discountRatePct: 10,
    },
  },
  sources: {
    price: { sigmaLog: 0.2, basis: 'assumption' },
    buildCost: { low: 445804, high: 544872 },
  },
};

const run = vi.fn(async () => result);
vi.mock('@/services/risk.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/risk.service')>()),
  runRiskSimulation: (...args: unknown[]) => run(...(args as [])),
}));

/** The risk step as the app wires it: the hook runs the simulation, the panel shows it. */
function RiskHarness({ config = DEFAULT_CONFIG }: { config?: FarmConfig }) {
  const [years, setYears] = useState(5);
  const [outbreak, setOutbreak] = useState(2);
  const risk = useRiskSimulation(config, {}, years, outbreak);
  return <RiskPanel risk={risk} years={years} onYearsChange={setYears} outbreakChancePct={outbreak} onOutbreakChange={setOutbreak} />;
}

const renderRisk = (props: Parameters<typeof RiskHarness>[0] = {}) =>
  render(
    <I18nProvider>
      <RiskHarness {...props} />
    </I18nProvider>
  );

describe('RiskPanel', () => {
  it('runs on its own and leads with the chance of getting the money back', async () => {
    run.mockClear();
    renderRisk();
    const chance = await screen.findByTestId('risk-chance');
    // Pays back within the 5-year horizon in 58% of futures, as the Earnings step counts it.
    expect(within(chance).getByText('58%')).toBeInTheDocument();
    expect(within(chance).getByText('Mixed odds')).toBeInTheDocument();
    expect(screen.getByText('If things go badly')).toBeInTheDocument();
    expect(screen.getByText('Typical result')).toBeInTheDocument();
    expect(screen.getByText('If things go well')).toBeInTheDocument();
    // The sale price swings the result most here, so the tip is about selling.
    expect(screen.getByText(/The selling price matters most here/)).toBeInTheDocument();
    expect(screen.getByText('An outbreak')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps the statistics and the assumed ranges under the details', async () => {
    renderRisk();
    await screen.findByTestId('risk-chance');
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('32%')).toBeInTheDocument(); // chance of a loss
    expect(screen.getAllByText('58%').length).toBeGreaterThan(1); // also listed: pays back within 5 years
    expect(screen.getByText('4.4 yrs')).toBeInTheDocument();
    expect(screen.getByText(/Sale price varies by about ±20% a year/)).toBeInTheDocument();
    expect(screen.getByText(/Mortality 3 \/ 5 \/ 12%/)).toBeInTheDocument();
    expect(screen.getByText(/A 2% yearly chance of an outbreak/)).toBeInTheDocument();
  });

  it('runs again when the horizon or the outbreak chance changes', async () => {
    run.mockClear();
    renderRisk();
    await screen.findByTestId('risk-chance');
    fireEvent.click(screen.getByRole('radio', { name: '10 yrs' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run.mock.calls[1]).toEqual(expect.arrayContaining([expect.objectContaining({ years: 10 })]));
    fireEvent.click(screen.getByRole('radio', { name: '5%' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(3));
    expect(run.mock.calls[2]).toEqual(expect.arrayContaining([expect.objectContaining({ outbreakChancePct: 5 })]));
  });

  it('offers to try again when the simulation fails', async () => {
    run.mockRejectedValueOnce(new Error('down'));
    renderRisk();
    expect(await screen.findByText('The simulation could not run. Please try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    expect(await screen.findByTestId('risk-chance')).toBeInTheDocument();
  });
});

describe('verdictFor', () => {
  it('turns a chance into plain odds', () => {
    expect(verdictFor(0.8)).toBe('good');
    expect(verdictFor(0.5)).toBe('mixed');
    expect(verdictFor(0.2)).toBe('poor');
  });
});
