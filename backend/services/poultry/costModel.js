// What a poultry shed costs to build and to stock for its first batch. Pure arithmetic over
// shared/poultry-norms.json: NABARD's 2023-24 rates per sq ft of shed and per bird, plus the few items the
// sources do not price, which are flagged so the app can say so (as the polyhouse model did for glass).
//
// NABARD's unit cost is capital plus the first batch's working capital (chicks, feed, insurance, vaccines, and
// for layers 1.5 months of labour), so the comparison with it uses the whole project cost.

const fs = require("fs");
const path = require("path");
const { NORMS, SQFT_PER_SQM } = require("../../data/poultry/norms");

const COSTS = NORMS.costs;
// The model is rate-based and the inputs are approximate, so quote a band, not a point (as the polyhouse model).
const ESTIMATE_BAND = 0.1;
// A monitor roof lifts a strip a fifth of the span to leave a ridge vent; its cap overlaps the main roof.
const MONITOR_WIDTH_SHARE = 0.2;
const MONITOR_LIFT_M = 0.45;

const round = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
};

/** Meat birds are sold by weight; layers by the egg. */
const productOf = (birdType) => NORMS.birdTypes[birdType]?.product ?? "meat";
const isLayer = (birdType) => productOf(birdType) === "eggs";
/** The price family a bird's planning defaults come from. */
const familyOf = (birdType) => (isLayer(birdType) ? "layer" : birdType === "desi" ? "desi" : "broiler");

/** The planner's starting prices for this bird, each with its source (shared/poultry-norms.json planningDefaults). */
function defaultPrices(birdType) {
  const defaults = isLayer(birdType) ? NORMS.planningDefaults.layer : NORMS.planningDefaults.meat[familyOf(birdType)];
  return Object.fromEntries(Object.entries(defaults).map(([key, entry]) => [key, entry.value]));
}

/** Shed rate per sq ft with its source: controlled sheds and backyard sheds have their own; open sheds go by bird. */
function shedRate({ housingSystem, birdType }) {
  const rates = COSTS.shedInrPerSqft;
  if (housingSystem === "environment-controlled") return { inrPerSqft: rates.environmentControlled.value, source: rates.environmentControlled.source };
  if (housingSystem === "backyard") return { inrPerSqft: rates.backyard.value, source: rates.backyard.source };
  const entry = isLayer(birdType) ? rates.layer : rates.broiler;
  return { inrPerSqft: entry.value, source: entry.source };
}

/** Feeders, drinkers and cages per bird, with the source of the rate. */
function equipmentRate({ birdType, housingSystem, feedingSystem }) {
  const rates = COSTS.equipmentInrPerBird;
  if (housingSystem === "backyard") return { inrPerBird: rates.desi.value, source: rates.desi.source };
  if (birdType === "layer-cage") {
    const entry = feedingSystem === "automatic" ? rates.layerCageAutomatic : rates.layerCage;
    return { inrPerBird: entry.value, source: entry.source };
  }
  const entry = feedingSystem === "automatic" ? rates.automatic : feedingSystem === "semi-auto" ? rates.semiAuto : rates.broiler;
  return { inrPerBird: entry.value, source: entry.source };
}

/**
 * The roof's cross-section (one span, eaves to eaves, with the overhang on both sides) and the area of each gable end
 * above the eaves. Gable: two slopes. Lean-to: one slope across the span. Monitor: a gable plus a lifted ridge strip.
 */
function roofProfile({ width, eavesHeight, ridgeHeight, roofType }) {
  const w = Number(width);
  const rise = Math.max(Number(ridgeHeight) - Number(eavesHeight), 0);
  const overhang = 2 * COSTS.roofOverhangM.value;
  if (roofType === "lean-to") return { arcM: Math.hypot(w, rise) + overhang, endCapSqm: (w * rise) / 2 };
  const gable = 2 * Math.hypot(w / 2, rise) + overhang;
  if (roofType === "monitor") {
    const strip = w * MONITOR_WIDTH_SHARE;
    return { arcM: gable + strip, endCapSqm: (w * rise) / 2 + strip * MONITOR_LIFT_M };
  }
  return { arcM: gable, endCapSqm: (w * rise) / 2 };
}

/** Roof sheeting plus side walls up to the eaves plus both gable ends: what the frame holds up and what gets covered. */
function envelopeArea(shed) {
  const l = Number(shed.length);
  const w = Number(shed.width);
  const { arcM, endCapSqm } = roofProfile(shed);
  return l * arcM + 2 * (l + w) * Number(shed.eavesHeight) + 2 * endCapSqm;
}

/** Envelope relative to the open shed NABARD's rate stands for, on the same footprint (1.00 = that shed). */
function envelopeFactor(shed) {
  const { eavesHeight, ridgeHeight, roofType } = COSTS.referenceShed;
  const reference = envelopeArea({ ...shed, eavesHeight, ridgeHeight, roofType });
  const actual = envelopeArea(shed);
  return reference > 0 ? Number((actual / reference).toFixed(3)) : 1;
}

/** Enclosed air volume: floor area times the mean height (a triangle fills half its box; a monitor adds its strip). */
function shedVolume(shed) {
  const l = Number(shed.length);
  const w = Number(shed.width);
  const eaves = Number(shed.eavesHeight);
  const rise = Math.max(Number(shed.ridgeHeight) - eaves, 0);
  const monitor = shed.roofType === "monitor" ? w * MONITOR_WIDTH_SHARE * MONITOR_LIFT_M : 0;
  return l * (w * (eaves + rise / 2) + monitor);
}

const sourceOf = (id) => NORMS.sources[id];
const unverified = (entry) => entry && sourceOf(entry.source) && sourceOf(entry.source).verified === false;

/**
 * Capital cost (what a scheme or a bank loan finances) and the first batch's working capital.
 * @param {object} shed      the setup: length, width, eavesHeight, ridgeHeight, housingSystem, roofType, roofSheet,
 *                           sideWalls, entry, birdType, feedingSystem
 * @param {number} flockSize birds housed
 * @param {object} [prices]  chickInr, feedInrPerKg, vaccineInrPerBird (defaults: the planner's starting prices)
 */
function calculateShedCost(shed, flockSize, prices = {}) {
  const birds = Math.max(0, Number(flockSize) || 0);
  const areaSqm = Number(shed.length) * Number(shed.width);
  const areaSqft = areaSqm * SQFT_PER_SQM;
  const price = { ...defaultPrices(shed.birdType), ...prices };
  const flagged = [];
  const flag = (item, entry) => {
    if (unverified(entry)) flagged.push(item);
  };

  const rate = shedRate(shed);
  const envelope = envelopeFactor(shed);
  const civilCost = round(areaSqft * rate.inrPerSqft * envelope);
  if (sourceOf(rate.source)?.verified === false) flagged.push("environment-controlled shed rate");

  // The shed rate already includes a GI roof (a thatch roof for backyard sheds); only the difference is added.
  const { arcM } = roofProfile(shed);
  const roofSqm = Number(shed.length) * arcM;
  const sheets = COSTS.roofSheetInrPerSqm;
  const baseSheet = shed.housingSystem === "backyard" ? "thatch" : "gi-sheet";
  const chosenSheet = sheets[shed.roofSheet] ? shed.roofSheet : baseSheet;
  const roofSheetCost = round(roofSqm * (sheets[chosenSheet].value - sheets[baseSheet].value));
  if (chosenSheet !== baseSheet) flag(`roof sheet: ${chosenSheet}`, sheets[chosenSheet]);

  const sideWallCost = shed.sideWalls === "mesh-auto-curtain" ? round(2 * Number(shed.length) * COSTS.autoCurtainInrPerM.value) : 0;
  if (sideWallCost > 0) flag("automatic curtains", COSTS.autoCurtainInrPerM);

  let entryCost = 0;
  if (shed.entry === "door-footbath" || shed.entry === "anteroom") {
    entryCost += COSTS.footbathInr.value;
    flag("footbath", COSTS.footbathInr);
  }
  if (shed.entry === "anteroom") {
    entryCost += round(COSTS.anteroomSqft.value * rate.inrPerSqft);
    flag("anteroom size", COSTS.anteroomSqft);
  }

  const equipment = equipmentRate(shed);
  const equipmentCost = round(birds * equipment.inrPerBird);
  if (sourceOf(equipment.source)?.verified === false) flagged.push(`equipment: ${shed.feedingSystem}`);

  // Layer units carry a feed store, fencing and water supply sized for 5,000 birds; NABARD's broiler units have none.
  const unitShare = isLayer(shed.birdType) ? birds / COSTS.fixedItemsPerBirds.value : 0;
  const feedStoreCost = round(unitShare * COSTS.feedStore.sqft * COSTS.feedStore.inrPerSqft);
  const fencingCost = round(unitShare * COSTS.fencingInr.value);
  const waterSupplyCost = round(unitShare * COSTS.waterSupplyInr.value);

  const civilWorks = civilCost + roofSheetCost + entryCost + feedStoreCost;
  const electricalCost = round((civilWorks * COSTS.electricalPctOfCivil.value) / 100);
  const capitalCost = civilWorks + sideWallCost + equipmentCost + fencingCost + waterSupplyCost + electricalCost;

  const wc = isLayer(shed.birdType) ? COSTS.workingCapital.layer : COSTS.workingCapital.meat;
  const chicks = Math.ceil(birds * wc.chicksPerBird);
  const chickCost = round(chicks * price.chickInr);
  const workingCapital = {
    chicks,
    chickCost,
    feedCost: round(birds * wc.feedKgPerBird * price.feedInrPerKg),
    insuranceCost: round((chickCost * COSTS.birdInsurancePctOfChickCost.value) / 100),
    vaccineCost: round(birds * price.vaccineInrPerBird),
    labourCost: round((birds / COSTS.labourBirdsPerWorker.value) * wc.labourMonths * COSTS.labourInrPerMonth.value),
  };
  workingCapital.total = Object.entries(workingCapital).reduce((sum, [key, value]) => (key === "chicks" ? sum : sum + value), 0);
  const projectCost = capitalCost + workingCapital.total;

  return {
    cost: {
      civilCost,
      roofSheetCost,
      sideWallCost,
      entryCost,
      equipmentCost,
      feedStoreCost,
      fencingCost,
      waterSupplyCost,
      electricalCost,
      capitalCost,
      workingCapital,
      projectCost,
      costPerBird: birds > 0 ? round(projectCost / birds) : 0,
      costPerSqft: areaSqft > 0 ? round(capitalCost / areaSqft) : 0,
      costRange: { low: round(capitalCost * (1 - ESTIMATE_BAND)), high: round(capitalCost * (1 + ESTIMATE_BAND)) },
    },
    diagnostics: {
      areaSqft: Math.round(areaSqft),
      roofSqm: Math.round(roofSqm),
      envelopeFactor: envelope,
      shedInrPerSqft: rate.inrPerSqft,
      equipmentInrPerBird: equipment.inrPerBird,
      // Chosen items whose price has no published source: the app marks them "verify".
      unsourcedRates: flagged,
      prices: price,
    },
  };
}

/* ---------------------------- NABARD comparison ---------------------------- */

const NABARD_CSV = path.resolve(__dirname, "../../../datasets/csv/nabard_poultry_unit_costs.csv");
let nabardUnits = null;

/** The NABARD unit-cost rows (datasets/csv/nabard_poultry_unit_costs.csv), read once. */
function loadNabardUnits() {
  if (nabardUnits) return nabardUnits;
  const { parseCsv } = require("../../scripts/loadReferenceData");
  nabardUnits = parseCsv(fs.readFileSync(NABARD_CSV, "utf8")).map((row) => ({
    state: row.state,
    year: row.year,
    birdType: row.bird_type,
    system: row.system,
    // Read from the unit's description: "Environment-controlled, contract farming".
    controlled: /environment/i.test(row.system),
    contract: /contract/i.test(row.system),
    birds: Number(row.birds),
    unitCostInr: Number(row.unit_cost_inr),
    source: { document: row.source_document, url: row.source_url },
  }));
  return nabardUnits;
}

// The state whose units stand in for a state with none of its own (the first one transcribed).
const NABARD_FALLBACK_STATE = "Jharkhand";

/** Keeps the units that match, unless none does. */
const preferring = (units, match) => (units.some(match) ? units.filter(match) : units);

/**
 * The NABARD unit cost for the closest unit of this bird, scaled per bird to the flock, and the cost a scheme or bank
 * would recognise: the lower of the project cost and that norm. The project's own state is used when it has units
 * (banks lend against their own state's), else Jharkhand's; within them, the unit with the same kind of shed and
 * farming model, then the nearest size. A contract unit leaves out the chicks and feed the company brings, so it is
 * compared with the capital cost only. Null for birds NABARD's tables are not compared for (desi).
 */
function nabardComparison({ birdType, housingSystem, farmingModel = "independent", stateName = "", flockSize, projectCost, capitalCost = projectCost }) {
  const kind = birdType === "broiler" ? "broiler" : birdType === "layer-cage" ? "layer-cage" : null;
  const birds = Math.max(0, Number(flockSize) || 0);
  if (!kind || birds === 0) return null;
  const all = loadNabardUnits().filter((unit) => unit.birdType === kind);
  const own = all.filter((unit) => unit.state.toLowerCase() === String(stateName).trim().toLowerCase());
  let units = own.length > 0 ? own : all.filter((unit) => unit.state === NABARD_FALLBACK_STATE);
  if (units.length === 0) return null;
  const controlled = housingSystem === "environment-controlled";
  units = preferring(units, (unit) => unit.controlled === controlled);
  units = preferring(units, (unit) => unit.contract === (farmingModel === "contract"));
  // A newer year of the same state replaces an older one.
  const latest = units.map((unit) => unit.year).sort().pop();
  units = units.filter((unit) => unit.year === latest);
  const nearest = units.reduce((best, unit) => (Math.abs(unit.birds - birds) < Math.abs(best.birds - birds) ? unit : best));
  const perBird = nearest.unitCostInr / nearest.birds;
  const normCostInr = round(perBird * birds);
  const ownCost = nearest.contract ? capitalCost : projectCost;
  return {
    state: nearest.state,
    year: nearest.year,
    system: nearest.system,
    // True when the project's state has no units yet and another state's stand in.
    otherState: own.length === 0,
    unitBirds: nearest.birds,
    // A booklet that prints only a cost per bird, with no unit size, is kept as a one-bird row.
    perBirdNorm: nearest.birds === 1,
    unitCostInr: nearest.unitCostInr,
    perBirdInr: round(perBird),
    normCostInr,
    ownCostInr: round(ownCost),
    // True when the unit is a contract one and so only the capital cost is compared.
    capitalOnly: nearest.contract,
    ratio: normCostInr > 0 ? Number((ownCost / normCostInr).toFixed(2)) : null,
    recognisedCostInr: Math.min(round(ownCost), normCostInr),
    // Where only open-sided units are published, a controlled shed costs more by design.
    note: controlled && !nearest.controlled ? "NABARD prices open-sided units; a controlled shed is expected to cost more." : null,
    source: nearest.source,
  };
}

module.exports = {
  ESTIMATE_BAND,
  productOf,
  isLayer,
  familyOf,
  defaultPrices,
  shedRate,
  equipmentRate,
  roofProfile,
  envelopeArea,
  envelopeFactor,
  shedVolume,
  calculateShedCost,
  loadNabardUnits,
  nabardComparison,
};
