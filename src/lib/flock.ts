import norms from '../../shared/poultry-norms.json';
import type { BirdType, HousingSystem } from '@/types/poultry';

/** Square feet in a square metre: the norms give floor space per bird in sq ft. */
export const SQFT_PER_SQM = 10.7639;

type Norms = { birdTypes: Record<string, { housing: string[]; sqftPerBird: Record<string, number> }> };
const birds = (norms as Norms).birdTypes;

/** Floor space per bird in sq ft, or null for a bird and shed the sources do not cover (for example, broilers in a backyard). */
export function sqftPerBird(birdType: BirdType, housing: HousingSystem): number | null {
  const bird = birds[birdType];
  return bird && bird.housing.includes(housing) ? bird.sqftPerBird[housing] : null;
}

/**
 * How many birds a shed holds: floor area over the space each bird needs. The same arithmetic as
 * backend/services/flock.js (a test keeps the two equal).
 */
export function flockSize(shed: { length: number; width: number; birdType: BirdType; housing: HousingSystem }): number | null {
  const space = sqftPerBird(shed.birdType, shed.housing);
  if (space === null) return null;
  const areaSqft = Math.max(0, Number(shed.length) || 0) * Math.max(0, Number(shed.width) || 0) * SQFT_PER_SQM;
  return Math.floor(areaSqft / space + 1e-9);
}

/** The floor area in m2 a flock needs (the inverse, for "I want 5,000 birds"). */
export function floorAreaFor(flock: { birds: number; birdType: BirdType; housing: HousingSystem }): number | null {
  const space = sqftPerBird(flock.birdType, flock.housing);
  if (space === null) return null;
  return (Math.max(0, Number(flock.birds) || 0) * space) / SQFT_PER_SQM;
}
