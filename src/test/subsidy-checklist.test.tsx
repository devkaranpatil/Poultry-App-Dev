import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubsidyChecklist } from '@/components/greenhouse/SubsidyChecklist';
import { I18nProvider, translate } from '@/context/I18nContext';
import { buildChecklist, checklistKey, nhbApplicationFee } from '@/lib/subsidyChecklist';

describe('nhbApplicationFee', () => {
  it('follows the NHB fee slabs by project cost', () => {
    expect(nhbApplicationFee(5_00_000)).toBe(1_000);
    expect(nhbApplicationFee(10_00_000)).toBe(1_000);
    expect(nhbApplicationFee(10_00_001)).toBe(2_000);
    expect(nhbApplicationFee(50_00_000)).toBe(5_000);
    expect(nhbApplicationFee(2_00_00_000)).toBe(10_000);
  });
});

describe('buildChecklist', () => {
  it('lists the NHB steps with the fee for the project', () => {
    const steps = buildChecklist('NHB', 40_00_000, 'Maharashtra');
    expect(steps.map((step) => step.id)).toEqual(['land', 'dpr', 'loan', 'ipa', 'fee', 'documents', 'build', 'inspection', 'reserve']);
    expect(steps.find((step) => step.id === 'fee')?.vars).toEqual({ fee: '5,000' });
    expect(steps.every((step) => step.source === 'nhb')).toBe(true);
  });

  it('lists the state mission steps, and adds Telangana rules only there', () => {
    expect(buildChecklist('NHM', 5_00_000, 'Goa').map((step) => step.id)).toEqual(['district', 'bis', 'norm']);
    const telangana = buildChecklist('NHM', 5_00_000, 'Telangana');
    expect(telangana).toHaveLength(8);
    expect(telangana.filter((step) => step.source === 'telangana')).toHaveLength(5);
  });

  it('has text for every step in every language', () => {
    const all = [
      ...buildChecklist('NHB', 1, '').map((step) => ({ step, scheme: 'NHB' as const })),
      ...buildChecklist('NHM', 1, 'Telangana').map((step) => ({ step, scheme: 'NHM' as const })),
    ];
    for (const locale of ['en', 'hi', 'mr'] as const) {
      for (const { step, scheme } of all) {
        const key = checklistKey(scheme, step);
        const text = translate(locale, key);
        expect(text, `${locale} ${key}`).not.toBe(key);
        if (locale !== 'en') expect(text, `${locale} ${key} is translated`).not.toBe(translate('en', key));
      }
    }
  });
});

describe('SubsidyChecklist', () => {
  beforeEach(() => window.localStorage.clear());

  const renderList = (state = 'Maharashtra') =>
    render(
      <I18nProvider>
        <SubsidyChecklist scheme="NHB" projectCost={30_00_000} state={state} />
      </I18nProvider>
    );

  it('shows the steps with the source and keeps ticks in this browser', () => {
    const { unmount } = renderList();
    const list = screen.getByTestId('subsidy-checklist');
    expect(within(list).getByText(/Rs 5,000/)).toBeInTheDocument();
    expect(within(list).getByText('0 of 9 done')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /NHB Scheme-1/ })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/nhb\.gov\.in\//));

    fireEvent.click(screen.getByRole('checkbox', { name: /Detailed Project Report/ }));
    expect(screen.getByText('1 of 9 done')).toBeInTheDocument();
    unmount();

    renderList();
    expect(screen.getByRole('checkbox', { name: /Detailed Project Report/ })).toBeChecked();
    expect(screen.getByText('1 of 9 done')).toBeInTheDocument();
  });

  it('still works when the browser blocks storage', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      renderList();
      expect(screen.getByText('0 of 9 done')).toBeInTheDocument();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
