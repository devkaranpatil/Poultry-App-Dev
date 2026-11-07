import type { BirdType } from '@/types/poultry';
import type { PoultryAssumptions } from '@/lib/poultryFinance';

/** The prices and rates that move a poultry farm's result most, per bird, in the order the estimate shows them. */
export const KEY_FIELDS: Record<'meat' | 'eggs', Array<{ field: string; unit: 'inr' | 'pct' }>> = {
  meat: [
    { field: 'saleInrPerKg', unit: 'inr' },
    { field: 'feedInrPerKg', unit: 'inr' },
    { field: 'chickInr', unit: 'inr' },
    { field: 'mortalityPct', unit: 'pct' },
  ],
  eggs: [
    { field: 'eggInr', unit: 'inr' },
    { field: 'feedInrPerKg', unit: 'inr' },
    { field: 'chickInr', unit: 'inr' },
    { field: 'layingMortalityPct', unit: 'pct' },
  ],
};

/** How far each case moves the base assumptions. Shown on screen, so the case is never a hidden guess. */
export const SCENARIO_SHIFT = {
  downside: { sale: -0.15, feed: 0.1, mortalityPoints: 2 },
  upside: { sale: 0.1, feed: -0.05, mortalityPoints: -1 },
} as const;

export type ScenarioName = keyof typeof SCENARIO_SHIFT;

export const productOf = (birdType: BirdType): 'meat' | 'eggs' => (birdType === 'layer-cage' || birdType === 'layer-floor' ? 'eggs' : 'meat');

/** The base assumptions with the sale price, feed price and mortality moved for a downside or upside case. */
export function scenarioAssumptions(base: PoultryAssumptions, birdType: BirdType, name: ScenarioName): Partial<PoultryAssumptions> {
  const [price, feed, , mortality] = KEY_FIELDS[productOf(birdType)].map(({ field }) => field);
  const values = base as unknown as Record<string, number>;
  const shift = SCENARIO_SHIFT[name];
  return {
    [price]: Number((values[price] * (1 + shift.sale)).toFixed(2)),
    [feed]: Number((values[feed] * (1 + shift.feed)).toFixed(2)),
    [mortality]: Math.max(0, Number((values[mortality] + shift.mortalityPoints).toFixed(2))),
  } as Partial<PoultryAssumptions>;
}
