import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StepViews, type ResultStepId } from '@/components/workspace/StepViews';
import { I18nProvider } from '@/context/I18nContext';
import { computeFinancials, defaultFinanceAssumptions } from '@/lib/finance';
import { DEFAULT_LOAN_TERMS } from '@/lib/loan';
import type { CalculationResult, GreenhouseConfig } from '@/types/greenhouse';

vi.mock('@/services/risk.service', () => ({ runRiskSimulation: vi.fn(() => new Promise(() => {})) }));

const config: GreenhouseConfig = {
  length: 30,
  width: 10,
  gutterHeight: 4,
  ridgeHeight: 6,
  greenhouseType: 'naturally-ventilated',
  roofType: 'gable',
  structureMaterial: 'gi-steel',
  coverMaterial: 'uv-polyfilm',
  sideVentilation: 'manual-rollup',
  doorEntry: 'single-sliding',
  selectedCrop: 'tomato',
  irrigationSystem: 'drip',
  state: 'Goa',
  district: 'North Goa',
};

const result: CalculationResult = {
  area: 300,
  volume: 1500,
  climate: {
    climateZone: 'Tropical Coastal',
    avgTemperature: 27,
    humidity: 78,
    rainfall: 2900,
    climateFactor: 1.05,
    advisories: ['High rainfall region - ensure robust site drainage.'],
  },
  cost: {
    structureCost: 255000,
    coverCost: 36000,
    ventilationCost: 13500,
    foundationCost: 54000,
    irrigationCost: 16500,
    electricalCost: 0,
    laborCost: 86250,
    miscCost: 10500,
    totalCost: 495338,
    costPerSqm: 1651,
    climateAdjustment: 0.05,
  },
  selectedCrop: {
    name: 'Tomato',
    suitability: 'good',
    expectedYield: '40-60 t/ha',
    season: 'Year-round',
    notes: 'Reliable protected-cultivation staple with strong market demand.',
    isSelected: true,
  },
  irrigation: {
    system: 'drip',
    ratePerSqm: 55,
    notes: ['Best fit for row crops with strong water-use efficiency.'],
  },
  crops: [
    {
      name: 'Cucumber',
      suitability: 'excellent',
      expectedYield: '220-300 t/ha',
      season: 'Year-round',
      notes: 'Ventilation is critical for disease control.',
    },
    {
      name: 'Gerbera',
      suitability: 'excellent',
      expectedYield: '250-350 stems/m2/year',
      season: 'Year-round',
      notes: 'Strong market in humid zones.',
    },
  ],
};

const assumptions = defaultFinanceAssumptions('tomato');

function renderStep(step: ResultStepId, overrides: Partial<Parameters<typeof StepViews>[0]> = {}) {
  window.localStorage.setItem('greenhouse.locale', 'en');
  const onNavigate = vi.fn();
  const onAssumptionsChange = vi.fn();
  render(
    <MemoryRouter>
      <I18nProvider>
        <StepViews
          step={step}
          onNavigate={onNavigate}
          config={config}
          result={result}
          isLoading={false}
          calculationError={null}
          onRetry={vi.fn()}
          ready
          missingItems={[]}
          assumptions={assumptions}
          onAssumptionsChange={onAssumptionsChange}
          financials={computeFinancials(result.cost.totalCost, result.area, assumptions, result.subsidy)}
          loanTerms={DEFAULT_LOAN_TERMS}
          onLoanTermsChange={vi.fn()}
          onShare={vi.fn()}
          includeAiSummary
          onIncludeAiSummaryChange={vi.fn()}
          {...overrides}
        />
      </I18nProvider>
    </MemoryRouter>
  );
  return { onNavigate, onAssumptionsChange };
}

describe('StepViews', () => {
  it('opens each step with what it answers and a plain bottom line', () => {
    renderStep('cost');
    expect(screen.getByRole('heading', { level: 1, name: 'Cost' })).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 8')).toBeInTheDocument();
    const inShort = screen.getByTestId('in-short');
    expect(inShort).toHaveTextContent(/Building this 300 m² greenhouse costs about ₹4\.95 L/);
    expect(inShort).toHaveTextContent(/The biggest part is structure/);
  });

  it('formats the cost breakdown in rupees with Indian digit grouping', () => {
    renderStep('cost');
    expect(screen.getAllByText(/^₹\d{1,2}(,\d{2})*,\d{3}$/).length).toBeGreaterThan(1);
  });

  it('walks on to the next step and back', () => {
    const { onNavigate } = renderStep('earnings');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Loan & subsidy' }));
    expect(onNavigate).toHaveBeenCalledWith('loan');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onNavigate).toHaveBeenCalledWith('cost');
  });

  it('says what is missing before the design is complete', () => {
    const { onNavigate } = renderStep('earnings', { ready: false, result: null, financials: null, missingItems: ['State', 'District'] });
    expect(screen.getByText('Finish the design first')).toBeInTheDocument();
    expect(screen.getByText('Still needed: State, District')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Design' }));
    expect(onNavigate).toHaveBeenCalledWith('design');
  });

  it('shows the site climate, advisories and crops for this climate', () => {
    renderStep('site');
    expect(screen.getByTestId('in-short')).toHaveTextContent(/North Goa has a Tropical Coastal climate/);
    expect(screen.getByText('Cucumber')).toBeInTheDocument();
    expect(screen.getByText('Gerbera')).toBeInTheDocument();
    expect(screen.getByText('Ventilation is critical for disease control.')).toBeInTheDocument();
    expect(screen.getByText('High rainfall region - ensure robust site drainage.')).toBeInTheDocument();
  });

  it('explains earnings in words and passes edits of the numbers up', () => {
    const { onAssumptionsChange } = renderStep('earnings');
    expect(screen.getByTestId('in-short')).toHaveTextContent(/In a normal year you would sell Tomato worth about/);
    fireEvent.change(screen.getByLabelText('Subsidy (%)'), { target: { value: '0' } });
    expect(onAssumptionsChange).toHaveBeenCalledWith(expect.objectContaining({ subsidyPct: 0 }));
  });

  it('explains a hard word when its question mark is pressed', async () => {
    renderStep('earnings');
    fireEvent.click(screen.getAllByRole('button', { name: 'What does “Payback period” mean?' })[0]);
    expect(await screen.findByText(/How many years of profit it takes to earn back/)).toBeInTheDocument();
  });

  it('sums up the loan and how well the farm covers it', () => {
    renderStep('loan');
    const inShort = screen.getByTestId('in-short');
    expect(inShort).toHaveTextContent(/The bank lends about/);
    expect(inShort).toHaveTextContent(/After the first 12 months you pay about/);
    expect(within(screen.getByTestId('loan-panel')).getByText('Bank loan')).toBeInTheDocument();
  });

  it('puts the optional AI summary between Risk and Report', () => {
    const { onNavigate } = renderStep('summary');
    expect(screen.getByRole('heading', { level: 1, name: 'AI summary' })).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    expect(screen.getByText('Step 7 of 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onNavigate).toHaveBeenCalledWith('risk');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Report' }));
    expect(onNavigate).toHaveBeenCalledWith('report');
  });

  it('offers a signed-out user the AI summary sign-in, or a skip to the report', () => {
    const { onNavigate } = renderStep('summary');
    expect(screen.getByTestId('summary-sign-in')).toHaveTextContent('Log in to get an AI summary');
    expect(screen.getByTestId('in-short')).toHaveTextContent('This step is optional');
    fireEvent.click(screen.getByRole('button', { name: 'Skip, go to the report' }));
    expect(onNavigate).toHaveBeenCalledWith('report');
  });

  it('says on the report whether the AI summary goes in, with a way back to it', () => {
    const { onNavigate } = renderStep('report');
    expect(screen.getByTestId('report-summary-status')).toHaveTextContent('No AI summary in this report. It is optional.');
    fireEvent.click(screen.getByRole('button', { name: /Go to AI summary/ }));
    expect(onNavigate).toHaveBeenCalledWith('summary');
  });

  it('shows a calculation failure with a way to retry', () => {
    const onRetry = vi.fn();
    renderStep('cost', { calculationError: 'The server is busy', onRetry });
    expect(screen.getByText('The server is busy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry calculation/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
