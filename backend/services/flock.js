// How many birds a shed holds: floor area over the floor space each bird needs. The same arithmetic
// as src/lib/flock.ts (a test keeps the two equal).

const { SQFT_PER_SQM, sqftPerBird } = require("../data/poultry/norms");

/** The user's own stocking density when given (sq ft per bird), else the norm; null for an unsupported bird and shed. */
function spaceFor(birdType, housing, stockingDensity) {
  const norm = sqftPerBird(birdType, housing);
  if (norm === null) return null;
  const own = Number(stockingDensity);
  return stockingDensity !== null && stockingDensity !== undefined && Number.isFinite(own) && own > 0 ? own : norm;
}

/**
 * @param {{ length: number, width: number, birdType: string, housing: string, stockingDensity?: number|null }} shed  metres
 * @returns {number|null} whole birds, or null for a bird and shed the sources do not cover
 */
function flockSize({ length, width, birdType, housing, stockingDensity }) {
  const space = spaceFor(birdType, housing, stockingDensity);
  const areaSqft = Math.max(0, Number(length) || 0) * Math.max(0, Number(width) || 0) * SQFT_PER_SQM;
  if (space === null) return null;
  return Math.floor(areaSqft / space + 1e-9);
}

/** The floor area in m2 a flock needs (the inverse, for "I want 5,000 birds"). */
function floorAreaFor({ birds, birdType, housing, stockingDensity }) {
  const space = spaceFor(birdType, housing, stockingDensity);
  if (space === null) return null;
  return (Math.max(0, Number(birds) || 0) * space) / SQFT_PER_SQM;
}

module.exports = { spaceFor, flockSize, floorAreaFor };
