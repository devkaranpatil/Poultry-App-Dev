// Audits the poultry calculator against the official datasets in datasets/csv. Read-only: it needs no
// database and changes nothing. Rerun it whenever a rate, a norm or a dataset changes.
//
//   node backend/scripts/auditCalculations.js
//
// A. NABARD reproduction: given the inputs of each NABARD 2023-24 unit (its shed area, flock and prices), the
//    app must reproduce the unit cost within +/- 10% (src/test/poultry-calculations.test.ts holds it to that).
// B. Heat stress: how many districts of each state have a month of severe stress for broilers and for layers.
// C. Inputs that do not change the price, shown by varying one at a time.

const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./loadReferenceData");
const { SQFT_PER_SQM } = require("../data/poultry/norms");
const { calculateShedCost, loadNabardUnits } = require("../services/poultry/costModel");
const { assessHeatStress } = require("../services/poultry/heatStress");
const { runPoultryCalculation } = require("../services/poultry/calculator");

const CSV_DIR = path.resolve(__dirname, "../../datasets/csv");
const TOLERANCE = 0.1;
const pct = (n) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

// The shed area NABARD allows per bird in its unit costs: 600 sq ft for 500 broilers, 1 sq ft per caged layer.
const NABARD_SQFT_PER_BIRD = { broiler: 1.2, "layer-cage": 1 };
// NABARD's unit prices: chicks Rs 35, feed Rs 30/kg, vaccines Rs 32 (broiler) and medicines Rs 25 (layer) a bird.
const NABARD_PRICES = {
  broiler: { chickInr: 35, feedInrPerKg: 30, vaccineInrPerBird: 32 },
  "layer-cage": { chickInr: 35, feedInrPerKg: 30, vaccineInrPerBird: 25 },
};

/** The open shed NABARD prices, of a given floor area, 7 m wide where it fits. */
function nabardShed(birdType, birds) {
  const areaSqm = (birds * NABARD_SQFT_PER_BIRD[birdType]) / SQFT_PER_SQM;
  const width = Math.min(7, Math.sqrt(areaSqm));
  return {
    length: areaSqm / width,
    width,
    eavesHeight: 2.1,
    ridgeHeight: 3.5,
    housingSystem: "open-sided",
    roofType: "gable",
    roofSheet: "gi-sheet",
    sideWalls: "mesh-curtain",
    entry: "single-door",
    birdType,
    feedingSystem: birdType === "layer-cage" ? "trough" : "manual",
  };
}

// ---------------------------------------------------------------- A. NABARD reproduction
function auditNabardUnits() {
  return loadNabardUnits().map((unit) => {
    const { cost } = calculateShedCost(nabardShed(unit.birdType, unit.birds), unit.birds, NABARD_PRICES[unit.birdType]);
    const off = cost.projectCost / unit.unitCostInr - 1;
    return {
      unit: `${unit.state} ${unit.year} ${unit.birdType} ${unit.birds}`,
      "NABARD Rs": unit.unitCostInr,
      "app Rs": cost.projectCost,
      "capital Rs": cost.capitalCost,
      "working capital Rs": cost.workingCapital.total,
      off: pct(off),
      within: Math.abs(off) <= TOLERANCE ? "yes" : "NO",
      offShare: off,
    };
  });
}

// ---------------------------------------------------------------- B. heat stress by state
function auditHeatStress() {
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, "district_climate_monthly.csv"), "utf8")).filter((r) => r.month === "ANN");
  const byState = new Map();
  for (const r of rows) {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r.district);
  }
  return [...byState.entries()].sort().map(([state, districts]) => {
    const count = (product) =>
      districts.filter((district) => (assessHeatStress({ stateName: state, district, product, housingSystem: "open-sided" })?.severeMonths.length ?? 0) > 0).length;
    return { state, districts: districts.length, "broilers stressed": count("meat"), "layers stressed": count("eggs") };
  });
}

// ---------------------------------------------------------------- C. inputs that do not move the price
function auditInertInputs() {
  const base = {
    length: 30, width: 7, eavesHeight: 2.1, ridgeHeight: 3.5, housingSystem: "open-sided", roofType: "gable",
    frameMaterial: "steel-truss", roofSheet: "gi-sheet", sideWalls: "mesh-curtain", entry: "door-footbath",
    birdType: "layer-cage", feedingSystem: "trough", cageTiers: 3, state: "Maharashtra", district: "Pune",
  };
  const total = (over) => {
    const out = runPoultryCalculation({ ...base, ...over });
    return out.errors ? `invalid: ${Object.values(out.errors)[0]}` : out.result.cost.capitalCost;
  };
  const baseline = total({});
  // `inert` marks inputs that are meant not to change the build cost, with the reason.
  const variants = [
    ["frame: RCC pillars", { frameMaterial: "rcc-pillars" }, "NABARD's rate is per sq ft whatever holds the roof up"],
    ["cage tiers 3 -> 4", { cageTiers: 4 }, "cages are priced per bird"],
    ["district: Nagpur", { district: "Nagpur" }, "the district changes the climate advice, not the cost"],
    ["roof: monitor", { roofType: "monitor" }],
    ["roof sheet: PUF panel", { roofSheet: "puf-panel" }],
    ["entry: anteroom", { entry: "anteroom" }],
    ["eaves 2.1 -> 3 m", { eavesHeight: 3, ridgeHeight: 4.4 }],
  ];
  return [{ change: "(baseline)", "capital Rs": baseline, "price moved": "", note: "" }].concat(
    variants.map(([change, over, inert]) => {
      const t = total(over);
      const moved = t !== baseline;
      return { change, "capital Rs": t, "price moved": moved ? "yes" : inert ? "no (expected)" : "NO", note: moved || !inert ? "" : inert };
    })
  );
}

if (require.main === module) {
  console.log(`A. NABARD 2023-24 unit costs reproduced from their own inputs (tolerance +/- ${TOLERANCE * 100}%)\n`);
  const units = auditNabardUnits();
  console.table(units.map(({ offShare, ...row }) => row));
  console.log("\nB. Districts with at least one month of severe heat stress (THI above 30), open-sided shed\n");
  console.table(auditHeatStress());
  console.log("\nC. Does changing one input move the capital cost?\n");
  console.table(auditInertInputs());
  if (units.some((row) => row.within !== "yes")) process.exitCode = 1;
}

module.exports = { TOLERANCE, NABARD_PRICES, nabardShed, auditNabardUnits, auditHeatStress, auditInertInputs };
