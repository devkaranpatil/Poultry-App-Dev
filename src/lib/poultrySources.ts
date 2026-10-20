import norms from '../../shared/poultry-norms.json';
import type { BirdType, FarmingModel } from '@/types/poultry';

/** Where a figure comes from. `verified` is false for secondary or old sources and for the planner's own assumptions. */
export interface FigureSource {
  id: string;
  document: string;
  url: string | null;
  verified: boolean;
}

type Valued = { value: number; source: string };
interface Norms {
  sources: Record<string, { document: string; url: string | null; verified: boolean }>;
  birdTypes: Record<string, { product: string; sources: Record<string, string> }>;
  costs: Record<string, Valued>;
  prices: Record<string, Valued[]>;
  planningDefaults: { meat: Record<string, Record<string, Valued>>; layer: Record<string, Valued> };
}
const N = norms as unknown as Norms;

export function sourceById(id: string | undefined): FigureSource | null {
  const record = id ? N.sources[id] : undefined;
  return record ? { id: id as string, document: record.document, url: record.url, verified: record.verified } : null;
}

// Assumptions whose source lives somewhere other than the bird's own record.
const COST_FIELDS: Record<string, string> = {
  labourInrPerBird: 'labourInrPerBird',
  otherCostInrPerBird: 'otherCostInrPerBird',
  labourInrPerMonth: 'labourInrPerMonth',
  labourBirdsPerWorker: 'labourBirdsPerWorker',
  insurancePctOfChickCost: 'birdInsurancePctOfChickCost',
};
const PRICE_FIELDS = ['manureInrPerBird', 'gunnyBagsInrPerBird'];
const MANURE_FIELDS = ['growerManureKgPerWeek', 'layerManureKgPerWeek'];

/** The source of one planning assumption for this bird, or null for the farmer's own figure (the subsidy counted). */
export function assumptionSource(birdType: BirdType, farmingModel: FarmingModel, field: string): FigureSource | null {
  void farmingModel; // the same sources apply to independent and contract farms; the fields differ
  const bird = N.birdTypes[birdType];
  if (!bird) return null;
  const defaults = bird.product === 'eggs' ? N.planningDefaults.layer : N.planningDefaults.meat[birdType === 'desi' ? 'desi' : 'broiler'];
  if (defaults[field]) return sourceById(defaults[field].source);
  if (COST_FIELDS[field]) return sourceById(N.costs[COST_FIELDS[field]]?.source);
  if (PRICE_FIELDS.includes(field)) return sourceById(N.prices[field]?.[0]?.source);
  if (MANURE_FIELDS.includes(field)) return sourceById(bird.sources.manureKgPerBirdPerWeek);
  return sourceById(bird.sources[field]);
}
