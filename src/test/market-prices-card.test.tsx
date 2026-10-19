import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketPricesCard } from '@/components/greenhouse/ReferenceCards';
import { I18nProvider } from '@/context/I18nContext';
import type { CropMarketPrice, ReferenceContext } from '@/types/greenhouse';

const price = (over: Partial<CropMarketPrice> = {}): CropMarketPrice => ({
  crop: 'Tomato',
  commodity: 'Tomato',
  unit: 'INR per quintal',
  date: '2026-10-13',
  stale: false,
  state: { markets: 5, medianInrPerQuintal: 3000, lowInrPerQuintal: 2000, highInrPerQuintal: 4000 },
  india: { markets: 100, medianInrPerQuintal: 2500, lowInrPerQuintal: 700, highInrPerQuintal: 5000 },
  revenue: { basis: 'state', lowInr: 36000, highInr: 54000 },
  source: 'test',
  ...over,
});

const reference = (marketPrices: CropMarketPrice[]): ReferenceContext => ({
  governmentNorm: null,
  areaLimit: null,
  indicativeSubsidy: null,
  marketPrices,
  districtClimate: null,
});

const renderCard = (marketPrices: CropMarketPrice[]) =>
  render(
    <I18nProvider>
      <MarketPricesCard reference={reference(marketPrices)} stateName="Maharashtra" />
    </I18nProvider>
  );

describe('MarketPricesCard', () => {
  it('shows the state price, its range and the market count', () => {
    renderCard([price()]);
    expect(screen.getByText('Market prices today (mandi)')).toBeInTheDocument();
    expect(screen.getByText(/Maharashtra median/)).toHaveTextContent('5 markets');
    expect(screen.getByText(/3,000\/quintal/)).toBeInTheDocument();
    expect(screen.getByText(/gross per crop, if the published yield range sells/)).toBeInTheDocument();
  });

  it('shows the national price when the state has fewer than 3 markets', () => {
    renderCard([price({ state: { markets: 1, medianInrPerQuintal: 1200, lowInrPerQuintal: 1200, highInrPerQuintal: 1200 } })]);
    expect(screen.getByText(/India median/)).toHaveTextContent('100 markets');
    expect(screen.queryByText(/Maharashtra median/)).not.toBeInTheDocument();
  });

  it('warns when the prices are old, and explains it is a snapshot', () => {
    renderCard([price({ stale: true, date: '2026-09-01' })]);
    expect(screen.getByText(/Last published 2026-09-01/)).toBeInTheDocument();
    expect(screen.getByText(/A snapshot, not a forecast/)).toBeInTheDocument();
  });

  it('renders nothing when no crop has a price', () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
  });
});
