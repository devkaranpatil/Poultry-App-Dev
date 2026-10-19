// Calculator factory behind /api/farm. The structure-type field name and its
// validator are passed in, so the field can be renamed without touching the maths.

const pricing = require("../data/pricing");
const phase25Climate = require("./climatePhase25");
const { deriveCrops } = require("./cropAdvisor");
const { IRRIGATION_PROFILES } = require("../data/cultivation");
const { computeSchemeSubsidy } = require("../data/subsidySchemes");
const {
  getClimateData,
  getClimateFactor,
  getClimateAdvisories,
  computeArea,
  computeVolume,
  calculateCost,
} = require("./costModel");

// Roof, gutter and ridge height are priced through the envelope surface. The door has no official rate
// (the NHB norm treats it as part of the structure), crop and district do not change the build cost.
const NOT_PRICED_INPUTS = ["doorType", "selectedCrop", "district"];

const normalizeMaterial = (value) => {
  const key = String(value || "").toLowerCase();
  if (key === "gi-steel" || key === "galvanized-iron") return "galvanized_iron";
  if (key === "uv-polyfilm") return "uv_polyfilm";
  if (key === "shade-net") return "shade_net";
  if (key === "insect-net") return "insect_net";
  if (key === "glass-panel" || key === "glass-panels") return "glass";
  return key;
};

const normalizeCrop = (value) => String(value || "").toLowerCase() || pricing.DEFAULT_SELECTED_CROP;

const normalizeIrrigationSystem = (value) => {
  const key = String(value || "").toLowerCase();
  if (key === "hydroponic_nft") return "hydroponic-nft";
  return key || pricing.DEFAULT_IRRIGATION_SYSTEM;
};

/**
 * @param {{ typeField: string, validate: (config: object) => Record<string, string> }} options
 */
function createCalculator({ typeField, validate }) {
  const enforceTypeCompatibility = (config) =>
    config[typeField] === "shade-net"
      ? { ...config, coverMaterial: "shade_net", sideVentilation: "none", doorType: "curtain" }
      : config;

  // Flat roofs have no rise, so ridge height is locked to gutter height.
  const enforceRoofHeightCompatibility = (config) =>
    config.roofType === "flat" ? { ...config, ridgeHeight: config.gutterHeight } : config;

  const normalizeConfigInput = (input = {}) => ({
    ...input,
    stateName: input.stateName || input.state || "",
    doorType: input.doorType || input.doorEntry || "",
    structureMaterial: normalizeMaterial(input.structureMaterial),
    coverMaterial: normalizeMaterial(input.coverMaterial),
    selectedCrop: normalizeCrop(input.selectedCrop),
    irrigationSystem: normalizeIrrigationSystem(input.irrigationSystem),
  });

  const normalizeAndSanitizeConfig = (input = {}) =>
    enforceTypeCompatibility(enforceRoofHeightCompatibility(normalizeConfigInput(input)));

  const buildCalculationResult = (config) => {
    const area = computeArea(config.length, config.width);
    const volume = computeVolume(config);

    const climateData = getClimateData(config.stateName, config.district);
    const climateGroup = climateData.group;
    const climatePhase = phase25Climate(climateGroup);
    const climateFactor = getClimateFactor(climateData);

    const crops = deriveCrops(climateGroup, config.selectedCrop, config.irrigationSystem);
    const irrigationProfile = IRRIGATION_PROFILES[config.irrigationSystem] || IRRIGATION_PROFILES[pricing.DEFAULT_IRRIGATION_SYSTEM];

    const { cost, diagnostics } = calculateCost(
      { ...config, isClimateControlled: config[typeField] === "climate-controlled", isShadeNet: config[typeField] === "shade-net" },
      area,
      climateFactor
    );

    // Drip and other irrigation are supported under their own scheme, so the protected-cultivation norm is
    // compared with the rest of the build cost (including its share of the climate surcharge).
    const subsidy = computeSchemeSubsidy({
      structureType: config[typeField],
      structureMaterial: config.structureMaterial,
      stateName: config.stateName,
      areaSqm: area,
      eligibleCostInr: cost.totalCost - Math.round(cost.irrigationCost * climateFactor),
    });

    return {
      area,
      volume,
      subsidy,
      climate: {
        climateZone: climateData.zone,
        avgTemperature: climateData.temp,
        humidity: climateData.humidity,
        rainfall: climateData.rainfall,
        // "district" when the figure is the IMD normal for that district, "state" for the typed state value.
        rainfallSource: climateData.rainfallSource,
        // Mean temperature of the hottest month; drives the heat surcharge. null when NASA has no data.
        hottestMonthMeanC: climateData.hottestMonthMeanC,
        climateFactor,
        advisories: [...getClimateAdvisories(climateData), ...climatePhase.warnings],
        season: climatePhase.season,
        climateGroup,
      },
      cost,
      crops,
      selectedCrop: crops.find((crop) => crop.isSelected) || null,
      irrigation: {
        system: config.irrigationSystem,
        ratePerSqm: diagnostics.irrigationRate,
        notes: irrigationProfile.notes,
      },
      // Inputs that shape the 3D model and the advice but not the price (the model rates by floor area).
      diagnostics: { ...diagnostics, climateGroup, season: climatePhase.season, notPriced: NOT_PRICED_INPUTS },
    };
  };

  /**
   * Validates raw input and runs the full calculation, for callers (HTTP routes and the AI
   * routes) that must ground their output in server-computed numbers.
   * Returns { errors } on invalid input, otherwise { config, result }.
   */
  const runCalculation = (input) => {
    const config = normalizeAndSanitizeConfig(input);
    const errors = validate(config);
    if (Object.keys(errors).length > 0) return { errors };
    return { config, result: buildCalculationResult(config) };
  };

  return { typeField, validate, normalizeAndSanitizeConfig, buildCalculationResult, runCalculation };
}

module.exports = { createCalculator, normalizeMaterial };
