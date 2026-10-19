// Audits the calculator against the official datasets in datasets/csv. Read-only: it needs no
// database and changes nothing. Rerun it whenever a rate, a state profile or a dataset changes.
//
//   node backend/scripts/auditCalculations.js
//
// A. Cost rates against the NHB/MIDH cost norms (structure + cover per m2).
// B. State climate profiles against the mean of NASA POWER district values in that state, and how
//    many districts trigger the heat surcharge (hottest month mean >= the threshold in pricing.js).
// C. Inputs that do not change the price, shown by varying one at a time.

const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./loadReferenceData");
const pricing = require("../data/pricing");
const STATE_CLIMATE = require("../data/stateClimate");
const { normSelector } = require("../services/referenceData");
const { createCalculator } = require("../services/calculator");
const { createConfigValidator } = require("../validators/configValidator");

const CSV_DIR = path.resolve(__dirname, "../../datasets/csv");
const read = (file) => parseCsv(fs.readFileSync(path.join(CSV_DIR, file), "utf8"));
const pct = (n) => `${n >= 0 ? "+" : ""}${Math.round(n * 100)}%`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------------------------------------------------------------- A. cost rates vs norms
function auditCostRates() {
  const norms = read("nhb_midh_protected_cultivation_cost_norms.csv").filter((r) => r.scheme === "MIDH/NHB");
  const rows = [];
  const cases = [
    { type: "naturally-ventilated", cover: "uv_polyfilm" },
    { type: "shade-net", cover: "shade_net" },
    { type: "climate-controlled", cover: "uv_polyfilm" },
  ];
  const materials = [
    { name: "gi-steel", key: "galvanized_iron", norm: "gi-steel" },
    { name: "aluminium", key: "aluminium", norm: "aluminium" },
    { name: "bamboo", key: "bamboo", norm: "bamboo" },
  ];
  for (const c of cases) {
    for (const m of materials) {
      if (c.type === "climate-controlled" && m.name === "bamboo") continue; // cannot be fan-and-pad
      const wanted = normSelector({ structureType: c.type, structureMaterial: m.norm });
      const norm = norms.find((n) => n.component === wanted.component && n.structure_type === wanted.structure);
      const shade = c.type === "shade-net" ? pricing.SHADE_NET_STRUCTURE_FACTOR[m.key] : 1;
      const modelRate = Math.round(pricing.STRUCTURE_RATE_PER_SQM[m.key] * shade + pricing.COVER_RATE_PER_SQM[c.cover]);
      const extra = c.type === "climate-controlled" ? pricing.CLIMATE_CONTROL_RATE_PER_SQM : 0;
      rows.push({
        structure: c.type,
        material: m.name,
        "norm row": wanted.structure,
        "norm Rs/m2": Number(norm.cost_norm_inr),
        "model structure+cover": modelRate,
        "vs norm": pct(modelRate / Number(norm.cost_norm_inr) - 1),
        "+electrical": extra ? modelRate + extra : "",
        "vs norm (with electrical)": extra ? pct((modelRate + extra) / Number(norm.cost_norm_inr) - 1) : "",
        // The norms have no aluminium row, so that comparison is against the tubular (GI) row and is not a defect.
        note: pricing.UNSOURCED_MATERIALS.structureMaterial.includes(m.key) ? "no official aluminium norm; assumed rate" : "",
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- B. state climate vs NASA
function auditStateClimate() {
  const monthly = read("district_climate_monthly.csv").filter((r) => r.month === "ANN");
  const byState = new Map();
  for (const r of monthly) {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r);
  }
  const { hotMonthMeanC, heavyRainfallMm } = pricing.CLIMATE_SURCHARGE;
  const profiles = require("../data/climateProfiles.json");
  const rows = [];
  for (const [state, profile] of Object.entries(STATE_CLIMATE)) {
    const d = byState.get(state);
    if (!d || d.length === 0) {
      // Not a pricing gap: the app falls back to the state profile. These states are cool and wet, so neither
      // surcharge changes (no month reaches the heat threshold; the state rainfall is already above the rain one).
      rows.push({ state, districts: 0, note: "no NASA district match; state profile used" });
      continue;
    }
    const temp = mean(d.map((r) => Number(r.t2m_mean_c)));
    const rh = mean(d.map((r) => Number(r.rh2m_pct)));
    const rain = mean(d.map((r) => Number(r.precip_mm_per_day) * 365));
    rows.push({
      state,
      districts: d.length,
      "temp app/NASA": `${profile.temp} / ${temp.toFixed(1)}`,
      "RH app/NASA": `${profile.humidity} / ${Math.round(rh)}`,
      "rain app/NASA": `${profile.rainfall} / ${Math.round(rain)}`,
      "temp off": Math.abs(profile.temp - temp) >= 2 ? "YES" : "",
      "RH off": Math.abs(profile.humidity - rh) >= 10 ? "YES" : "",
      "rain off": rain / profile.rainfall > 1.5 || rain / profile.rainfall < 0.67 ? "YES" : "",
      // Would the price surcharge flip if NASA's means were used instead of the app's profile?
      "hot districts": `${Object.entries(profiles.districts).filter(([k, v]) => k.startsWith(`${state}|`) && v.hottestMonthMeanC >= hotMonthMeanC).length}/${d.length}`,
      "rain flips": profile.rainfall > heavyRainfallMm !== rain > heavyRainfallMm ? "YES" : "",
      // NASA POWER's gridded precipitation runs low over steep, wet terrain (Mizoram), so a flip here means
      // "check the typed state value against IMD", not that the typed value is wrong.
      note: profile.rainfall > heavyRainfallMm !== rain > heavyRainfallMm ? "NASA rain below typed value; verify against IMD" : "",
    });
  }
  return rows;
}

// ---------------------------------------------------------------- C. inputs that do not move the price
function auditInertInputs() {
  const calc = createCalculator({ typeField: "polyhouseType", validate: createConfigValidator({ typeField: "polyhouseType", typeLabel: "Polyhouse" }) });
  const base = {
    length: 30, width: 10, gutterHeight: 4, ridgeHeight: 6, polyhouseType: "naturally-ventilated", roofType: "gable",
    structureMaterial: "gi-steel", coverMaterial: "uv-polyfilm", sideVentilation: "manual-rollup", doorEntry: "single-sliding",
    state: "Kerala", district: "Ernakulam", selectedCrop: "tomato", irrigationSystem: "drip",
  };
  const total = (over) => {
    const out = calc.runCalculation({ ...base, ...over });
    return out.errors ? `invalid: ${Object.values(out.errors)[0]}` : out.result.cost.totalCost;
  };
  const baseline = total({});
  // `inert` marks inputs that are meant not to change the build cost, with the reason.
  const variants = [
    ["door entry", { doorEntry: "double-sliding" }, "NHB/MIDH norms have no door row; doors are not priced"],
    ["door entry", { doorEntry: "roll-up" }, "NHB/MIDH norms have no door row; doors are not priced"],
    ["roof type", { roofType: "gothic" }],
    ["gutter height 4 -> 8 m", { gutterHeight: 8, ridgeHeight: 10 }],
    ["ridge height 6 -> 12 m", { ridgeHeight: 12 }],
    ["selected crop", { selectedCrop: "strawberry" }, "crop drives revenue and the advisor, not build cost"],
    // Kerala's districts are all below both surcharge thresholds, so probe a state where the district decides them.
    ["district: Hisar (hot) vs Panchkula", { state: "Haryana", district: "Hisar" }, null, { state: "Haryana", district: "Panchkula" }],
  ];
  return [{ change: "(baseline)", "total Rs": baseline, "price moved": "", note: "" }].concat(
    variants.map(([change, over, inert, against]) => {
      const t = total(over);
      const compare = against ? total(against) : baseline;
      const moved = t !== compare;
      return {
        change: `${change}${over.doorEntry ? `: ${over.doorEntry}` : ""}`,
        "total Rs": t,
        "price moved": moved ? "yes" : inert ? "no (expected)" : "NO",
        note: moved || !inert ? "" : inert,
      };
    })
  );
}

if (require.main === module) {
  console.log("A. Cost rates against the NHB/MIDH cost norms (Rs per m2 of floor area)\n");
  console.table(auditCostRates());
  console.log("\nB. State climate profiles against NASA POWER district means (app / NASA)\n");
  const states = auditStateClimate();
  console.table(states);
  const count = (key) => states.filter((r) => r[key] === "YES").length;
  console.log(
    `\n${states.length} states. Temperature off by 2 C or more: ${count("temp off")}. Humidity off by 10 points or more: ${count("RH off")}. ` +
      `Rainfall off by a third or more: ${count("rain off")}. Rain surcharge would flip: ${count("rain flips")}.`
  );
  console.log("\nC. Does changing one input move the total price?\n");
  console.table(auditInertInputs());
}

module.exports = { auditCostRates, auditStateClimate, auditInertInputs };
