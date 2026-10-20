import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoanPanel } from '@/components/farm/LoanPanel';
import { I18nProvider } from '@/context/I18nContext';
import { poultryLoanTerms, type LoanTerms } from '@/lib/loan';

// Rs 10 lakh financed, a counted subsidy and a year's figures shaped like a broiler farm's.
const summary = { capitalCost: 1_000_000, subsidyAmount: 0, annualRevenue: 2_400_000, annualOperatingCost: 2_150_000 };
const LAYER_TERMS = poultryLoanTerms('layer-cage');

function Harness({ initial = LAYER_TERMS }: { initial?: LoanTerms }) {
  const [terms, setTerms] = useState(initial);
  return (
    <I18nProvider>
      <LoanPanel summary={summary} birdType="layer-cage" terms={terms} onTermsChange={setTerms} />
    </I18nProvider>
  );
}

// A figure's label may carry a "?" explanation beside it, so find the term by its whole text.
const metric = (label: string) =>
  screen.getAllByRole('term').find((term) => term.textContent?.trim() === label)?.nextElementSibling?.textContent ?? '';

describe('LoanPanel', () => {
  it('shows the loan, margin, instalments, debt cover by year and the NABARD sources', () => {
    render(<Harness />);
    const panel = screen.getByTestId('loan-panel');
    expect(within(panel).getByText('Bank loan')).toBeInTheDocument();
    expect(metric('Loan')).toContain('7.50');
    expect(metric('Your margin')).toContain('2.50');
    expect(metric('Instalment after moratorium')).toContain('a month');
    expect(metric('Interest during moratorium')).toContain('a month');
    expect(within(screen.getByTestId('loan-years')).getAllByRole('row')).toHaveLength(1 + LAYER_TERMS.tenureYears);
    expect(panel).toHaveTextContent(/NABARD model bank project/);
    const links = within(panel).getAllByRole('link', { name: 'source' });
    expect(links.every((link) => link.getAttribute('href')?.startsWith('https://'))).toBe(true);
  });

  it('recalculates when the terms change and switches the instalment frequency', () => {
    render(<Harness />);
    const before = metric('Instalment after moratorium');
    fireEvent.change(screen.getByLabelText('Repayment (years, with moratorium)'), { target: { value: '10' } });
    expect(metric('Instalment after moratorium')).not.toBe(before);
    expect(within(screen.getByTestId('loan-years')).getAllByRole('row')).toHaveLength(11);

    fireEvent.click(screen.getByRole('radio', { name: 'Quarterly' }));
    expect(screen.getByRole('radio', { name: 'Quarterly' })).toHaveAttribute('aria-checked', 'true');
    expect(metric('Instalment after moratorium')).toContain('a quarter');
  });

  it('warns above the NABARD limit and when the farm cannot pay the instalments', () => {
    render(<Harness initial={{ ...LAYER_TERMS, loanSharePct: 95, tenureYears: 2, moratoriumMonths: 0 }} />);
    expect(screen.getByText(/lend up to 90%/)).toBeInTheDocument();
    expect(screen.getByText(/does not earn enough to pay the instalments/)).toBeInTheDocument();
  });

  it("restores NABARD's terms for the bird", () => {
    render(<Harness initial={{ ...LAYER_TERMS, interestPct: 4 }} />);
    expect(screen.getByLabelText('Interest (% a year)')).toHaveValue(4);
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(screen.getByLabelText('Interest (% a year)')).toHaveValue(LAYER_TERMS.interestPct);
  });
});
