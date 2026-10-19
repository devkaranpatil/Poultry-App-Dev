// Pure calculation functions for footprint, volume, climate surcharge and cost.
// No I/O and no request objects, so every formula is unit-testable in isolation.

const pricing = require("../data/pricing");
const STATE_CLIMATE = require("../data/stateClimate");
const CLIMATE_PROFILES = require("../data/climateProfiles.json");
const RAINFALL_PROFILES = require("../data/rainfallProfiles.json");

const DEFAULT_CLIMATE = {
  zone: "General",
  group: "Composite",
  temp: 28,
  humidity: 60,
  rainfall: 1200,
};

// Plus/minus band around the point estimate.
const ESTIMATE_BAND = 0.1;

const round = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
};

const getClimateData = (stateName, district) => {
  const state = STATE_CLIMATE[stateName] || DEFAULT_CLIMATE;
  // The district's own hottest month when NASA has it, else the state's average hottest month, else unknown.
  const districtHeat = CLIMATE_PROFILES.districts[`${stateName}|${district}`];
  // IMD district rainfall normals when imported (see datasets/README.md), else the state's typed approximation.
  const districtRain = RAINFALL_PROFILES.districts[`${stateName}|${district}`];
  return {
    ...state,
    rainfall: districtRain ? districtRain.annualMm : state.rainfall,
    rainfallSource: districtRain ? "district" : "state",
    hottestMonthMeanC: districtHeat ? districtHeat.hottestMonthMeanC : (state.hottestMonthMeanC ?? null),
  };
};

const isHotClimate = (climate) =>
  typeof climate.hottestMonthMeanC === "number" && climate.hottestMonthMeanC >= pricing.CLIMATE_SURCHARGE.hotMonthMeanC;

/** Additive surcharge on a 1.00 base: heavy rain (+5%) and a very hot hottest month (+3%). */
const getClimateFactor = (climate) => {
  const { heavyRainfallMm, heavyRainfall, hotTemp } = pricing.CLIMATE_SURCHARGE;
  let factor = 1;
  if (climate.rainfall > heavyRainfallMm) factor += heavyRainfall;
  if (isHotClimate(climate)) factor += hotTemp;
  return Number(factor.toFixed(2));
};

const getClimateAdvisories = (climate) => {
  const advisories = [];
  if (climate.rainfall > 2500) advisories.push("High rainfall region - ensure robust site drainage.");
  if (isHotClimate(climate)) advisories.push("High temperature region - strengthen cooling and shading strategy.");
  if (climate.humidity > 75) advisories.push("High humidity - monitor fungal disease pressure proactively.");
  return advisories;
};

const computeArea = (length, width) => Number(length) * Number(width);

/**
 * Enclosed air volume = floor area x mean cross-section height.
 *  - flat:   gutter height
 *  - gable:  gutter + half the rise (a triangle fills 1/2 of its bounding box)
 *  - gothic: gutter + two thirds of the rise (an arch fills ~2/3 of its bounding box)
 */
const computeVolume = ({ length, width, gutterHeight, ridgeHeight, roofType }) => {
  const area = computeArea(length, width);
  const gutter = Number(gutterHeight);
  const rise = Math.max(Number(ridgeHeight) - gutter, 0);
  if (roofType === "flat") return area * gutter;
  const fill = roofType === "gothic" ? 2 / 3 : 1 / 2;
  return area * (gutter + rise * fill);
};

/**
 * Outer surface that must be framed and covered: four walls up to the gutter, the gable/arch ends,
 * and the roof. Gable roofs are two slopes; gothic roofs are approximated as a half-ellipse (Ramanujan).
 */
const computeEnvelopeArea = ({ length, width, gutterHeight, ridgeHeight, roofType }) => {
  const l = Number(length);
  const w = Number(width);
  const gutter = Number(gutterHeight);
  const rise = roofType === "flat" ? 0 : Math.max(Number(ridgeHeight) - gutter, 0);
  const half = w / 2;

  let roofArc = w; // flat
  let endCap = 0; // area of each end wall above the gutter line
  if (roofType === "gable") {
    roofArc = 2 * Math.hypot(half, rise);
    endCap = (w * rise) / 2;
  } else if (roofType === "gothic") {
    const h = ((half - rise) ** 2) / ((half + rise) ** 2);
    roofArc = Math.PI * (half + rise) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h))); // full ellipse perimeter
    roofArc /= 2; // half-ellipse
    endCap = (Math.PI * half * rise) / 2;
  }

  const walls = 2 * (l + w) * gutter;
  return walls + 2 * endCap + l * roofArc;
};

/** Envelope surface relative to the NHB reference design on the same footprint (1.00 = reference). */
const getEnvelopeFactor = (config) => {
  const reference = computeEnvelopeArea({ ...pricing.REFERENCE_DESIGN, length: config.length, width: config.width });
  const actual = computeEnvelopeArea(config);
  return reference > 0 ? Number((actual / reference).toFixed(3)) : 1;
};

/** Component costs by floor area, then one climate multiplier on the subtotal. */
const calculateCost = (config, area, climateFactor) => {
  const baseStructureRate = pricing.STRUCTURE_RATE_PER_SQM[config.structureMaterial] || pricing.STRUCTURE_RATE_PER_SQM.galvanized_iron;
  // A shade-net house is lighter than a covered house: scale by the official norm ratio.
  const shadeFactor = config.isShadeNet
    ? pricing.SHADE_NET_STRUCTURE_FACTOR[config.structureMaterial] || pricing.SHADE_NET_STRUCTURE_FACTOR.galvanized_iron
    : 1;
  // Frame and cover quantities follow the real envelope surface, not just the footprint.
  const envelopeFactor = getEnvelopeFactor(config);
  const structureRate = baseStructureRate * shadeFactor * envelopeFactor;
  const coverRate = (pricing.COVER_RATE_PER_SQM[config.coverMaterial] || pricing.COVER_RATE_PER_SQM.uv_polyfilm) * envelopeFactor;
  const ventilationRate = pricing.VENTILATION_RATE_PER_SQM[config.sideVentilation] || 0;
  const irrigationRate = pricing.IRRIGATION_RATE_PER_SQM[config.irrigationSystem] || pricing.IRRIGATION_RATE_PER_SQM[pricing.DEFAULT_IRRIGATION_SYSTEM];

  const structureCost = round(area * structureRate);
  const coverCost = round(area * coverRate);
  const ventilationCost = round(area * ventilationRate);
  const foundationCost = round(area * pricing.FOUNDATION_RATE_PER_SQM);
  const irrigationCost = round(area * irrigationRate);
  const electricalCost = config.isClimateControlled ? round(area * pricing.CLIMATE_CONTROL_RATE_PER_SQM) : 0;
  const laborCost = round((structureCost + coverCost + foundationCost) * pricing.LABOR_RATIO);
  const miscCost = round(area * pricing.MISC_RATE_PER_SQM);

  const subtotal = structureCost + coverCost + ventilationCost + foundationCost + irrigationCost + electricalCost + laborCost + miscCost;
  const totalCost = round(subtotal * climateFactor);
  const costPerSqm = area > 0 ? round(totalCost / area) : 0;

  return {
    cost: {
      structureCost,
      coverCost,
      ventilationCost,
      foundationCost,
      irrigationCost,
      electricalCost,
      laborCost,
      miscCost,
      totalCost,
      costPerSqm,
      climateAdjustment: Number((climateFactor - 1).toFixed(2)),
      // Rupee value of the climate surcharge, so the component lines reconcile to totalCost.
      climateAdjustmentAmount: totalCost - subtotal,
      // The model is rate-based and the inputs are approximate, so quote a band, not a point.
      costRange: { low: round(totalCost * (1 - ESTIMATE_BAND)), high: round(totalCost * (1 + ESTIMATE_BAND)) },
    },
    diagnostics: {
      // Chosen materials whose rate has no official source (aluminium frame, glass cover).
      unsourcedRates: Object.entries(pricing.UNSOURCED_MATERIALS).flatMap(([field, values]) => (values.includes(config[field]) ? [config[field]] : [])),
      subtotal, climateFactor, envelopeFactor, structureRate, coverRate, ventilationRate, irrigationRate, totalCost },
  };
};

module.exports = {
  DEFAULT_CLIMATE,
  round,
  getClimateData,
  getClimateFactor,
  getClimateAdvisories,
  isHotClimate,
  computeArea,
  computeVolume,
  computeEnvelopeArea,
  getEnvelopeFactor,
  calculateCost,
};
