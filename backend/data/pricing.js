// Single source of truth for the protected-cultivation cost model.
// All rates are INR per square metre of FLOOR area (the model prices by footprint, not by
// envelope surface), so they already bundle typical wall/roof quantities.

const STRUCTURE_RATE_PER_SQM = {
  galvanized_iron: 850,
  aluminium: 1200,
  bamboo: 400,
};

const COVER_RATE_PER_SQM = {
  uv_polyfilm: 120,
  shade_net: 80,
  insect_net: 95,
  glass: 260,
};

const VENTILATION_RATE_PER_SQM = {
  none: 0,
  "manual-rollup": 45,
  "motorized-rollup": 180,
  louver: 120,
};

const IRRIGATION_RATE_PER_SQM = {
  drip: 55,
  sprinkler: 72,
  fogger: 96,
  "hydroponic-nft": 185,
};

const FOUNDATION_RATE_PER_SQM = 180;
const MISC_RATE_PER_SQM = 35;

// ---- Rates derived from the official NHB/MIDH cost norms (datasets/csv, Appendix-1 of the NHB table).
// The norms are not used as prices. Only their RATIOS are, because the model's own rates already sit
// about 15% above the norm for a naturally ventilated tubular house (970 vs 844) and bamboo (520 vs 450).
const OFFICIAL_NORM_PER_SQM = {
  naturallyVentilatedTubular: 844,
  fanAndPad: 1400,
  shadeNetTubular: 710,
  naturallyVentilatedBamboo: 450,
  shadeNetBamboo: 360,
};

// A shade-net house is lighter than a covered house, so its structure costs less (norm ratio).
// Aluminium has no official row and follows the tubular ratio.
const SHADE_NET_STRUCTURE_FACTOR = {
  galvanized_iron: OFFICIAL_NORM_PER_SQM.shadeNetTubular / OFFICIAL_NORM_PER_SQM.naturallyVentilatedTubular,
  aluminium: OFFICIAL_NORM_PER_SQM.shadeNetTubular / OFFICIAL_NORM_PER_SQM.naturallyVentilatedTubular,
  bamboo: OFFICIAL_NORM_PER_SQM.shadeNetBamboo / OFFICIAL_NORM_PER_SQM.naturallyVentilatedBamboo,
};

// Fan-and-pad cooling and controls (fans, pads, controller, wiring). The official fan-and-pad norm
// exceeds the naturally ventilated tubular norm by 556 Rs/m2; scale that by the model's uplift over the norm.
const MODEL_UPLIFT_OVER_NORM =
  (STRUCTURE_RATE_PER_SQM.galvanized_iron + COVER_RATE_PER_SQM.uv_polyfilm) / OFFICIAL_NORM_PER_SQM.naturallyVentilatedTubular;
const CLIMATE_CONTROL_RATE_PER_SQM = Math.round(
  (OFFICIAL_NORM_PER_SQM.fanAndPad - OFFICIAL_NORM_PER_SQM.naturallyVentilatedTubular) * MODEL_UPLIFT_OVER_NORM
); // climate-controlled types only (stored in the response as electricalCost)

// Reference design the per-floor-area rates above stand for: the naturally ventilated house in NHB
// Technical Standard NHB-PH-Type 02-2011 (gutter height 4.0 m minimum range 4.0-4.5, ridge height 6.0 m,
// gable roof). Structure and cover scale with the real envelope surface relative to this design, so a
// taller house or a different roof costs more or less, and the reference design is unchanged.
const REFERENCE_DESIGN = { gutterHeight: 4, ridgeHeight: 6, roofType: "gable" };

// Material rates for which NO official price exists: the NHB/MIDH cost norms (both the current table and
// the 2008-09 norms, 40 pages, searched in full) have no aluminium, glass-house or door row. The model keeps
// its own assumed rates for these and the API flags them so the app can say so.
const UNSOURCED_MATERIALS = { structureMaterial: ["aluminium"], coverMaterial: ["glass"] };

// Labour as a share of structure + cover + foundation material cost.
const LABOR_RATIO = 0.25;

// Climate surcharges are additive on a 1.00 base.
// Heat is judged on the district's hottest month (NASA POWER 24-hour mean, backend/data/climateProfiles.json),
// not the annual mean: no Indian state has an annual mean above 30 C, so the old annual rule never fired.
// 35 C is the app's own threshold (a 24-hour mean of 35 C means daytime highs well into the 40s). It marks
// about a third of districts: the north-west and central plains.
const CLIMATE_SURCHARGE = {
  heavyRainfallMm: 2000,
  heavyRainfall: 0.05,
  hotMonthMeanC: 35,
  hotTemp: 0.03,
};

const DEFAULT_IRRIGATION_SYSTEM = "drip";
const DEFAULT_SELECTED_CROP = "tomato";

module.exports = {
  STRUCTURE_RATE_PER_SQM,
  COVER_RATE_PER_SQM,
  VENTILATION_RATE_PER_SQM,
  IRRIGATION_RATE_PER_SQM,
  FOUNDATION_RATE_PER_SQM,
  CLIMATE_CONTROL_RATE_PER_SQM,
  OFFICIAL_NORM_PER_SQM,
  REFERENCE_DESIGN,
  UNSOURCED_MATERIALS,
  SHADE_NET_STRUCTURE_FACTOR,
  MISC_RATE_PER_SQM,
  LABOR_RATIO,
  CLIMATE_SURCHARGE,
  DEFAULT_IRRIGATION_SYSTEM,
  DEFAULT_SELECTED_CROP,
};
