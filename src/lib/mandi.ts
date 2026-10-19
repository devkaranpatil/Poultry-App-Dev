import type { LatestMandiPrice } from '@/components/greenhouse/ReturnsPanel';
import type { CropMarketPrice } from '@/types/greenhouse';

/**
 * Today's mandi price for the selected crop in ₹ per kg: the state median when at least three markets reported (the
 * backend's own rule), otherwise the national one. Null for crops not on the mandi feed.
 */
export function latestMandiPrice(prices: CropMarketPrice[] | undefined, crop: string): LatestMandiPrice | null {
  const entry = prices?.find((price) => price.crop.toLowerCase() === crop);
  if (!entry) return null;
  const summary = entry.state && entry.state.markets >= 3 ? entry.state : entry.india;
  if (!summary) return null;
  return { perUnit: summary.medianInrPerQuintal / 100, date: entry.date, scope: summary === entry.state ? 'state' : 'india' };
}
