/* =====================================================
   POULTRY SHED VALIDATOR
   Location: backend/validators/poultryValidator.js

   Field-by-field messages for a poultry setup (src/types/poultry.ts), in the
   same shape as configValidator.js so the UI can show them next to each input.
===================================================== */

const LIMITS = require("../../shared/poultry-limits.json");
const INDIA_LOCATIONS = require("../../shared/india-locations.json");
const { NORMS, isSupported } = require("../data/poultry/norms");

const BIRD_TYPES = Object.keys(NORMS.birdTypes);
const HOUSING_SYSTEMS = Object.keys(NORMS.housingSystems);
const ROOF_TYPES = ["gable", "monitor", "lean-to"];
const FRAME_MATERIALS = ["steel-truss", "rcc-pillars", "bamboo-wood"];
const ROOF_SHEETS = ["gi-sheet", "galvalume", "fibre-cement", "puf-panel", "thatch"];
const SIDE_WALLS = ["mesh-curtain", "mesh-auto-curtain", "closed-tunnel"];
const ENTRIES = ["single-door", "door-footbath", "anteroom"];
const FEEDING_SYSTEMS = ["manual", "semi-auto", "automatic", "trough"];
const FARMING_MODELS = ["independent", "contract"];
const CATEGORIES = ["general", "sc-st"];
const CAGE_TIERS = [2, 3, 4];

const isPositive = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
const within = (value, field) => Number(value) >= LIMITS[field].min && Number(value) <= LIMITS[field].max;
const range = (label, field, unit = "m") => `${label} must be between ${LIMITS[field].min} and ${LIMITS[field].max} ${unit}`;
const isLettersOnly = (value) => typeof value === "string" && /^[a-zA-Z\s.'-]+$/.test(value);
const isDistrictName = (value) => typeof value === "string" && /^[a-zA-Z0-9\s.'-]+$/.test(value);

/**
 * @param {object} config  a normalised poultry setup (stateName, not state)
 * @returns {Record<string, string>} field-keyed messages; empty when valid
 */
function validatePoultryConfig(config) {
  const errors = {};
  const choose = (field, allowed, name) => {
    if (config[field] === undefined || config[field] === null || config[field] === "") errors[field] = `${name} is required`;
    else if (!allowed.includes(config[field])) errors[field] = `${name} selection is invalid`;
  };
  const measure = (field, name) => {
    if (!isPositive(config[field])) errors[field] = `${name} must be a positive number`;
    else if (!within(config[field], field)) errors[field] = range(name, field);
  };

  /* ---------- SIZE ---------- */
  measure("length", "Length");
  measure("width", "Width");
  measure("eavesHeight", "Eaves height");
  measure("ridgeHeight", "Ridge height");
  if (!errors.eavesHeight && !errors.ridgeHeight && Number(config.ridgeHeight) <= Number(config.eavesHeight)) {
    errors.heightLogic = "Ridge height must be greater than eaves height";
  }
  if (config.stockingDensity !== null && config.stockingDensity !== undefined && config.stockingDensity !== "") {
    if (!isPositive(config.stockingDensity) || !within(config.stockingDensity, "stockingDensity")) {
      errors.stockingDensity = range("Stocking density", "stockingDensity", "sq ft per bird");
    }
  }

  /* ---------- CHOICES ---------- */
  choose("birdType", BIRD_TYPES, "Bird type");
  choose("housingSystem", HOUSING_SYSTEMS, "Housing system");
  choose("roofType", ROOF_TYPES, "Roof type");
  choose("frameMaterial", FRAME_MATERIALS, "Frame");
  choose("roofSheet", ROOF_SHEETS, "Roof sheet");
  choose("sideWalls", SIDE_WALLS, "Side walls");
  choose("entry", ENTRIES, "Entry");
  choose("feedingSystem", FEEDING_SYSTEMS, "Feeding system");
  choose("farmingModel", FARMING_MODELS, "Farming model");
  choose("beneficiaryCategory", CATEGORIES, "Beneficiary category");
  if (!CAGE_TIERS.includes(Number(config.cageTiers))) errors.cageTiers = "Cage tiers must be 2, 3 or 4";

  /* ---------- COMPATIBILITY ---------- */
  const { birdType, housingSystem, sideWalls, frameMaterial, roofSheet, feedingSystem, farmingModel } = config;
  if (!errors.birdType && !errors.housingSystem && !isSupported(birdType, housingSystem)) {
    errors.housingSystem = `${NORMS.birdTypes[birdType].label} is not kept in this kind of shed (${NORMS.housingSystems[housingSystem].label})`;
  }
  if (!errors.sideWalls && !errors.housingSystem) {
    if (housingSystem === "environment-controlled" && sideWalls !== "closed-tunnel") {
      errors.sideWalls = "An environment-controlled shed needs closed walls with tunnel fans and cooling pads";
    } else if (housingSystem !== "environment-controlled" && sideWalls === "closed-tunnel") {
      errors.sideWalls = "Closed tunnel walls are only for an environment-controlled shed";
    }
  }
  if (!errors.frameMaterial && !errors.housingSystem && (frameMaterial === "bamboo-wood") !== (housingSystem === "backyard")) {
    errors.frameMaterial = housingSystem === "backyard" ? "A backyard shed is built of bamboo or wood" : "A bamboo or wood frame is only for a backyard shed";
  }
  if (!errors.roofSheet && roofSheet === "thatch" && housingSystem !== "backyard") {
    errors.roofSheet = "A thatch roof is only for a backyard shed";
  }
  if (!errors.feedingSystem && !errors.birdType) {
    if (birdType === "layer-cage" && !["trough", "automatic"].includes(feedingSystem)) {
      errors.feedingSystem = "Layer cages are fed by troughs or an automatic line";
    } else if (birdType !== "layer-cage" && feedingSystem === "trough") {
      errors.feedingSystem = "Troughs are for layer cages";
    }
  }
  if (!errors.farmingModel && !errors.birdType && farmingModel === "contract" && NORMS.birdTypes[birdType].product === "eggs") {
    errors.farmingModel = "Contract farming is for meat birds; layer farms sell their own eggs";
  }

  /* ---------- LOCATION ---------- */
  const { stateName, district } = config;
  if (!stateName || !isLettersOnly(stateName)) {
    errors.stateName = "State name is required and may contain letters, spaces, apostrophes, periods, or hyphens";
  } else if (!Object.prototype.hasOwnProperty.call(INDIA_LOCATIONS, stateName)) {
    errors.stateName = "State is not supported";
  }
  if (district && !isDistrictName(district)) {
    errors.district = "District name may contain letters, numbers, spaces, apostrophes, periods, or hyphens";
  } else if (district && !errors.stateName && !INDIA_LOCATIONS[stateName].includes(district)) {
    errors.district = "District does not belong to the selected state";
  }

  return errors;
}

module.exports = {
  BIRD_TYPES,
  HOUSING_SYSTEMS,
  ROOF_TYPES,
  FRAME_MATERIALS,
  ROOF_SHEETS,
  SIDE_WALLS,
  ENTRIES,
  FEEDING_SYSTEMS,
  FARMING_MODELS,
  CATEGORIES,
  CAGE_TIERS,
  validatePoultryConfig,
};
