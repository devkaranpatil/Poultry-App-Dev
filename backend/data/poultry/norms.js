// Poultry housing and production norms (shared/poultry-norms.json, also read by the frontend).
// Pure data and lookups: no database, so every calculation gets the same answer.

const NORMS = require("../../../shared/poultry-norms.json");

const SQFT_PER_SQM = 10.7639;
const BIRD_TYPES = Object.keys(NORMS.birdTypes);
const HOUSING_SYSTEMS = Object.keys(NORMS.housingSystems);

/** True when the sources describe this bird in this kind of shed (for example, no broilers in a backyard). */
function isSupported(birdType, housing) {
  const bird = NORMS.birdTypes[birdType];
  return Boolean(bird && bird.housing.includes(housing));
}

/** Floor space per bird in sq ft, or null for a combination the sources do not cover. */
function sqftPerBird(birdType, housing) {
  return isSupported(birdType, housing) ? NORMS.birdTypes[birdType].sqftPerBird[housing] : null;
}

/** The source record behind an id, with the id itself. */
function source(id) {
  const record = NORMS.sources[id];
  return record ? { id, ...record } : null;
}

module.exports = { NORMS, SQFT_PER_SQM, BIRD_TYPES, HOUSING_SYSTEMS, isSupported, sqftPerBird, source };
