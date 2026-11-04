import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StepViews, type ResultStepId } from '@/components/workspace/StepViews';
import { I18nProvider } from '@/context/I18nContext';
import { poultryLoanTerms } from '@/lib/loan';
import { SAMPLE_CONFIG, sampleResult } from './helpers/poultryResult';

vi.mock('@/services/risk.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/risk.service')>()),
  runRiskSimulation: vi.fn(() => new Promise(() => {})),
}));

// A 1,076-bird open broiler shed in Nagpur, sold at Rs 110 a kg so it makes a profit.
const config = SAMPLE_CONFIG;
const result = sampleResult(config, { saleInrPerKg: 110 });

function renderStep(step: ResultStepId, overrides: Partial<Parameters<typeof StepViews>[0]> = {}) {
  window.localStorage.setItem('farm.locale', 'en');
  const onNavigate = vi.fn();
  const onAssumptionsChange = vi.fn();
  const onSitingTicksChange = vi.fn();
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
          assumptions={result.assumptions}
          onAssumptionsChange={onAssumptionsChange}
          financials={result.returns}
          sitingTicks={{}}
          onSitingTicksChange={onSitingTicksChange}
          loanTerms={poultryLoanTerms('broiler')}
          onLoanTermsChange={vi.fn()}
          onShare={vi.fn()}
          includeAiSummary
          onIncludeAiSummaryChange={vi.fn()}
          {...overrides}
        />
      </I18nProvider>
    </MemoryRouter>
  );
  return { onNavigate, onAssumptionsChange, onSitingTicksChange };
}

describe('StepViews', () => {
  it('opens each step with what it answers and a plain bottom line', () => {
    renderStep('cost');
    expect(screen.getByRole('heading', { level: 1, name: 'Cost' })).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 8')).toBeInTheDocument();
    const inShort = screen.getByTestId('in-short');
    expect(inShort).toHaveTextContent(/Building the shed for 1,076 birds costs about ₹/);
    expect(inShort).toHaveTextContent(/The biggest part is shed \(civil work\)/);
    expect(inShort).toHaveTextContent(/The first batch of chicks, feed and vaccines adds/);
  });

  it('lists the build cost, the first batch, the NABARD norm and every scheme with its verdict', () => {
    renderStep('cost');
    expect(screen.getAllByText(/^₹\d{1,2}(,\d{2})*,\d{3}$/).length).toBeGreaterThan(1);
    expect(screen.getByText('The first batch')).toBeInTheDocument();
    expect(screen.getByTestId('nabard-card')).toHaveTextContent(/5,000-bird unit/);
    expect(screen.getByTestId('nabard-card')).toHaveTextContent('(Maharashtra, 2025-26): Deep litter, all in all out');
    const schemes = screen.getByTestId('schemes-card');
    expect(within(schemes).getAllByText('Not eligible')).toHaveLength(2);
    expect(within(schemes).getByText(/Mukhyamantri Gramin Pashudhan/)).toBeInTheDocument();
  });

  it('walks on to the next step and back', () => {
    const { onNavigate } = renderStep('earnings');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Loan' }));
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

  it('shows the site climate, heat stress and the siting checklist', () => {
    const { onSitingTicksChange } = renderStep('site');
    expect(screen.getByRole('heading', { level: 1, name: 'Site & rules' })).toBeInTheDocument();
    const inShort = screen.getByTestId('in-short');
    expect(inShort).toHaveTextContent(/Nagpur has a/);
    expect(inShort).toHaveTextContent(/3 month\(s\) a year bring severe heat stress/);
    expect(screen.getByTestId('heat-stress')).toHaveTextContent(/April, May, June/);
    const checklist = screen.getByTestId('siting-checklist');
    expect(checklist).toHaveTextContent(/Registration with the state animal husbandry department/);
    expect(checklist).toHaveTextContent(/2 item\(s\) not confirmed yet/);
    fireEvent.click(within(checklist).getAllByRole('checkbox')[0]);
    expect(onSitingTicksChange).toHaveBeenCalledWith({ 'existing-farms': true });
  });

  it('explains earnings in words, shows the batch calendar and passes edits up', () => {
    const { onAssumptionsChange } = renderStep('earnings');
    expect(screen.getByTestId('in-short')).toHaveTextContent(/you run 6\.5 batches of Broiler/);
    expect(screen.getByTestId('batch-calendar')).toHaveTextContent(/Batch 7: placed day 336/);
    fireEvent.change(screen.getByLabelText('Live-bird price (₹/kg)'), { target: { value: '120' } });
    expect(onAssumptionsChange).toHaveBeenCalledWith(expect.objectContaining({ saleInrPerKg: 120 }));
    expect(screen.getByTestId('unverified-assumptions')).toHaveTextContent(/Live-bird price/);
  });

  it('gives the break-even price when the farm loses money', () => {
    const losing = sampleResult(config, { saleInrPerKg: 80 });
    renderStep('earnings', { result: losing, financials: losing.returns, assumptions: losing.assumptions });
    expect(screen.getByTestId('in-short')).toHaveTextContent(/it needs about ₹\d+(\.\d+)? a kg to break even/);
  });

  it('explains a hard word when its question mark is pressed', async () => {
    renderStep('earnings');
    fireEvent.click(screen.getAllByRole('button', { name: 'What does “Feed conversion ratio” mean?' })[0]);
    expect(await screen.findByText(/kg of feed per kg of live weight/)).toBeInTheDocument();
  });

  it('sums up the loan and how well the farm covers it', () => {
    renderStep('loan');
    const inShort = screen.getByTestId('in-short');
    expect(inShort).toHaveTextContent(/The bank lends about/);
    expect(inShort).toHaveTextContent(/You pay about .* a month/);
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
