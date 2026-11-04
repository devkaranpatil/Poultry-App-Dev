// The poultry calculation behind /api/poultry: one validated setup in, every figure the screens and the AI quote
// out (flock, build cost, NABARD comparison, schemes, siting rules, climate and heat stress, a year's returns and
// the batch calendar). Pure functions over the modules beside it, so a route, a test or the AI get the same answer.

const { getClimateData } = require("../climate");
const { computeSchemes } = require("../../data/poultry/schemes");
const { sitingRulesFor } = require("../../data/poultry/siting");
const { NORMS, sqftPerBird } = require("../../data/poultry/norms");
const { flockSize, spaceFor } = require("../flock");
const { validatePoultryConfig } = require("../../validators/poultryValidator");
const { calculateShedCost, nabardComparison, shedVolume, productOf, defaultPrices } = require("./costModel");
const { assessHeatStress } = require("./heatStress");
const { defaultAssumptions, computePoultryReturns, batchCalendar } = require("./production");

const LIMITS = require("../../../shared/poultry-limits.json");

// The frame material and cage tiers shape the 3D shed but not the price (NABARD's rate is per sq ft whatever holds
// the roof up, and cages are priced per bird); the district changes the climate, not the cost.
const NOT_PRICED_INPUTS = ["frameMaterial", "cageTiers", "district"];
const HEAVY_RAIN_MM = 2000;

const numberOrNull = (value) => (value === null || value === undefined || value === "" ? null : Number(value));

/**
 * Accepts the browser's field names (state) as well as the server's (stateName), and makes the choices a shed type
 * forces: a controlled shed has closed tunnel walls, a backyard shed a bamboo or wood frame.
 */
function normalizePoultryConfig(input = {}) {
  const config = {
    ...input,
    stateName: input.stateName || input.state || "",
    district: input.district || "",
    stockingDensity: numberOrNull(input.stockingDensity),
    cageTiers: input.cageTiers === undefined ? 3 : Number(input.cageTiers),
    farmingModel: input.farmingModel || "independent",
    beneficiaryCategory: input.beneficiaryCategory || "general",
  };
  if (config.housingSystem === "environment-controlled") config.sideWalls = "closed-tunnel";
  if (config.housingSystem === "backyard") config.frameMaterial = "bamboo-wood";
  return config;
}

/** Advice from the rainfall and the shed's width; the heat advice comes from assessHeatStress. */
function climateAdvisories(climate, config) {
  const advisories = [];
  if (climate.rainfall > HEAVY_RAIN_MM) {
    advisories.push("Heavy rainfall: raise the plinth, widen the roof overhang and drain the site away from the shed.");
  }
  if (config.housingSystem !== "environment-controlled" && Number(config.width) > LIMITS.openShedMaxWidth) {
    advisories.push(`An open-sided shed wider than ${LIMITS.openShedMaxWidth} m ventilates poorly across its width (IS 2732 and TNAU: 22 to 25 ft).`);
  }
  if (Number(config.length) > 0 && Number(config.width) > 0) {
    advisories.push("Run the long axis east to west so the sun does not shine in along the sides.");
  }
  return advisories;
}

/**
 * Every figure for one setup.
 * @param {object} config        a normalised, valid setup
 * @param {object} [assumptions] edits to the planning assumptions (prices, mortality, subsidy and so on)
 * @param {{ bankFinanced?: boolean }} [options]
 */
function buildPoultryResult(config, assumptions = {}, { bankFinanced = true } = {}) {
  const birds = flockSize({ ...config, housing: config.housingSystem }) ?? 0;
  const product = productOf(config.birdType);
  const planning = { ...defaultAssumptions(config.birdType, config.farmingModel, config.stateName), ...assumptions };
  // The cost model prices the first batch at the same chick, feed and vaccine prices the returns use.
  const prices = { ...defaultPrices(config.birdType), chickInr: planning.chickInr, feedInrPerKg: planning.feedInrPerKg, vaccineInrPerBird: planning.vaccineInrPerBird };
  const { cost, diagnostics } = calculateShedCost(config, birds, prices);
  // Under contract the integrator brings the chicks and feed, so the farmer finances the shed alone.
  const financedCost = planning.farmingModel === "contract" ? cost.capitalCost : cost.projectCost;

  const climateData = getClimateData(config.stateName, config.district);
  const heatStress = assessHeatStress({ stateName: config.stateName, district: config.district, product, housingSystem: config.housingSystem });

  const schemes = computeSchemes({
    birdType: config.birdType,
    state: config.stateName,
    category: config.beneficiaryCategory,
    // Schemes support capital cost only: no working capital or land.
    capitalCostInr: cost.capitalCost,
    flockSize: birds,
  });

  return {
    area: Number(config.length) * Number(config.width),
    areaSqft: diagnostics.areaSqft,
    volume: shedVolume(config),
    flock: {
      birds,
      product,
      sqftPerBird: spaceFor(config.birdType, config.housingSystem, config.stockingDensity),
      normSqftPerBird: sqftPerBird(config.birdType, config.housingSystem),
    },
    cost,
    financedCost,
    nabard: nabardComparison({
      birdType: config.birdType,
      housingSystem: config.housingSystem,
      farmingModel: planning.farmingModel,
      stateName: config.stateName,
      flockSize: birds,
      projectCost: cost.projectCost,
      capitalCost: cost.capitalCost,
    }),
    schemes,
    siting: sitingRulesFor(birds, { bankFinanced }),
    climate: {
      climateZone: climateData.zone,
      climateGroup: climateData.group,
      avgTemperature: climateData.temp,
      humidity: climateData.humidity,
      rainfall: climateData.rainfall,
      rainfallSource: climateData.rainfallSource,
      hottestMonthMeanC: climateData.hottestMonthMeanC,
      heatStress,
      advisories: [...climateAdvisories(climateData, config), ...(heatStress?.advice ?? [])],
    },
    returns: computePoultryReturns({ birdType: config.birdType, flockSize: birds, projectCost: financedCost, assumptions: planning }),
    calendar: batchCalendar({ birdType: config.birdType, assumptions: planning }),
    assumptions: planning,
    diagnostics: { ...diagnostics, notPriced: NOT_PRICED_INPUTS, label: NORMS.birdTypes[config.birdType].label },
  };
}

/**
 * Validates raw input and runs the full calculation. Returns { errors } on invalid input, otherwise { config, result }.
 * @param {object} input
 * @param {object} [assumptions]
 * @param {{ bankFinanced?: boolean }} [options]
 */
function runPoultryCalculation(input, assumptions, options) {
  const config = normalizePoultryConfig(input);
  const errors = validatePoultryConfig(config);
  if (Object.keys(errors).length > 0) return { errors };
  return { config, result: buildPoultryResult(config, assumptions, options) };
}

module.exports = { NOT_PRICED_INPUTS, normalizePoultryConfig, buildPoultryResult, runPoultryCalculation };
