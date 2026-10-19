import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoanPanel } from '@/components/greenhouse/LoanPanel';
import { I18nProvider } from '@/context/I18nContext';
import { computeFinancials } from '@/lib/finance';
import { DEFAULT_LOAN_TERMS, type LoanTerms } from '@/lib/loan';

// Rs 10 lakh project on 1,000 m2 with tomato defaults: subsidy, revenue and running cost from the real model.
const summary = computeFinancials(1_000_000, 1_000, { subsidyPct: 50, yieldPerSqm: 8.75, pricePerUnit: 30, operatingCostPct: 40 });

function Harness({ initial = DEFAULT_LOAN_TERMS }: { initial?: LoanTerms }) {
  const [terms, setTerms] = useState(initial);
  return (
    <I18nProvider>
      <LoanPanel summary={summary} terms={terms} onTermsChange={setTerms} />
    </I18nProvider>
  );
}

// A figure's label may carry a "?" explanation beside it, so find the term by its whole text.
const metric = (label: string) =>
  screen.getAllByRole('term').find((term) => term.textContent?.trim() === label)?.nextElementSibling?.textContent ?? '';

describe('LoanPanel', () => {
  it('shows the loan, margin, instalments, debt cover by year and the sources', () => {
    render(<Harness />);
    const panel = screen.getByTestId('loan-panel');
    expect(within(panel).getByText('Bank loan')).toBeInTheDocument();
    expect(metric('Loan')).toContain('8');
    expect(metric('Your margin')).toContain('2');
    expect(metric('Instalment after moratorium')).toContain('a month');
    expect(metric('Interest during moratorium')).toContain('a month');
    expect(within(screen.getByTestId('loan-years')).getAllByRole('row')).toHaveLength(1 + DEFAULT_LOAN_TERMS.tenureYears);
    expect(panel).toHaveTextContent(/reserve account/);
    expect(panel).toHaveTextContent(/Central Bank of India/);
    expect(panel).toHaveTextContent(/Canara Bank/);
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

  it('warns above the bank limit and when the farm cannot pay the instalments', () => {
    render(<Harness initial={{ ...DEFAULT_LOAN_TERMS, loanSharePct: 95, tenureYears: 2, moratoriumMonths: 0 }} />);
    expect(screen.getByText(/Banks lend up to 80%/)).toBeInTheDocument();
    expect(screen.getByText(/does not earn enough to pay the instalments/)).toBeInTheDocument();
  });

  it('restores the published defaults', () => {
    render(<Harness initial={{ ...DEFAULT_LOAN_TERMS, interestPct: 4 }} />);
    expect(screen.getByLabelText('Interest (% a year)')).toHaveValue(4);
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));
    expect(screen.getByLabelText('Interest (% a year)')).toHaveValue(DEFAULT_LOAN_TERMS.interestPct);
  });
});
