// Government assistance for protected cultivation, as currently published. The calculator uses it to work out
// which scheme a project falls under and how much of its cost that scheme supports. Pure data and arithmetic:
// no database, so every calculation gets the same answer.
//
// Sources (latest first):
//  - Letter File No. M-1401 1/5/2024-MIDH, Ministry of Agriculture & Farmers Welfare, 12.08.2025, "Modifications
//    in the MIDH guidelines under protected cultivation": the NHM/HMNEH sub-schemes cover up to 4,000 m2 per
//    beneficiary (raised from 2,500), and the National Horticulture Board covers 4,000 m2 and above.
//    https://shm.tg.nic.in/Download/Modification%20in%20the%20MIDH%20guidelines-Protected%20Cultivation.pdf
//  - MIDH Operational Guidelines 2025 (dated 31.12.2024), B.5 "Protected cultivation": cost norms by area slab,
//    assistance at 50%, rates 15% higher in NE & Himalayan States, scheduled areas, vibrant villages, Andaman &
//    Nicobar and Lakshadweep Islands. https://nhb.gov.in/writereaddata/082825102800MIDH%20Guideline%202025.pdf
//  - NHB Cost Norms and Pattern of Assistance (Appendix-1), A.2: per-m2 norms, 50% of cost limited to Rs 56 lakh
//    per project (project norm Rs 112 lakh). https://nhb.gov.in/hindi/pdf/Cost%20Norms.pdf
//    (the same figures are in datasets/csv/nhb_midh_protected_cultivation_cost_norms.csv; a test keeps them equal)

const ASSISTANCE_PERCENT = 50;

/** From this area a project goes to the National Horticulture Board; below it, to the state mission. */
const NHB_THRESHOLD_SQM = 4000;
const STATE_MISSION_MAX_SQM = 4000;

/** The MIDH 2025 slabs end at 2,500 m2. The 2025 letter raised the area limit to 4,000 m2 without a new rate. */
const LAST_PUBLISHED_SLAB_SQM = 2500;

const SPECIAL_AREA_UPLIFT = 1.15;

// North Eastern and Himalayan States and the island UTs named in B.5 (scheduled areas and vibrant villages are
// not identifiable from a state name, so they are not covered here).
const SPECIAL_AREA_STATES = new Set([
  "Arunachal Pradesh", "Assam", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Sikkim", "Tripura",
  "Himachal Pradesh", "Uttarakhand", "Jammu and Kashmir", "Jammu & Kashmir", "Ladakh",
  "Andaman and Nicobar Islands", "Andaman & Nicobar Islands", "Lakshadweep",
]);

/** MIDH Operational Guidelines 2025, B.5: Rs per m2 by area slab ({ upToSqm, rate }), plain areas. */
const MIDH_2025_NORMS = {
  fanAndPad: [
    { upToSqm: 500, rate: 1800 },
    { upToSqm: 1008, rate: 1600 },
    { upToSqm: 2500, rate: 1500 },
  ],
  naturallyVentilatedTubular: [
    { upToSqm: 500, rate: 1200 },
    { upToSqm: 1008, rate: 1050 },
    { upToSqm: 2500, rate: 1000 },
  ],
  naturallyVentilatedBamboo: [{ upToSqm: 2500, rate: 450 }],
  shadeNetTubular: [{ upToSqm: 2500, rate: 710 }],
  shadeNetBamboo: [{ upToSqm: 2500, rate: 450 }],
};

/** NHB Appendix-1, A.2: Rs per m2 (plain, hilly). */
const NHB_NORMS = {
  fanAndPad: { plain: 1400, hilly: 1610 },
  naturallyVentilatedTubular: { plain: 844, hilly: 970 },
  naturallyVentilatedBamboo: { plain: 450, hilly: 518 },
  shadeNetTubular: { plain: 710, hilly: 816 },
  shadeNetBamboo: { plain: 360, hilly: 414 },
};
const NHB_PROJECT_CAP_INR = 5600000; // 50% of the Rs 112 lakh project norm

const SOURCES = {
  stateMission: {
    document: "MIDH Operational Guidelines 2025, B.5 Protected cultivation; area limit as modified by the MoA&FW letter of 12.08.2025",
    url: "https://nhb.gov.in/writereaddata/082825102800MIDH%20Guideline%202025.pdf",
  },
  nhb: {
    document: "NHB Cost Norms and Pattern of Assistance (Appendix-1), A.2; NHB threshold as modified by the MoA&FW letter of 12.08.2025",
    url: "https://nhb.gov.in/hindi/pdf/Cost%20Norms.pdf",
  },
};

/** Which norm row describes this structure. Aluminium has no row of its own and follows the tubular one. */
function normKey(structureType, structureMaterial) {
  const bamboo = structureMaterial === "bamboo";
  if (structureType === "climate-controlled") return "fanAndPad";
  if (structureType === "shade-net") return bamboo ? "shadeNetBamboo" : "shadeNetTubular";
  return bamboo ? "naturallyVentilatedBamboo" : "naturallyVentilatedTubular";
}

/** The rate of the slab the whole project falls in, as the guideline words it ("Rs 1600/Sq.m (>500 up to 1008)"). */
function slabRate(slabs, areaSqm) {
  return (slabs.find((slab) => areaSqm <= slab.upToSqm) || slabs[slabs.length - 1]).rate;
}

const round = (value) => Math.round(value);

/**
 * The scheme a project falls under and the assistance it can expect.
 * @param {object} input
 * @param {"naturally-ventilated"|"climate-controlled"|"shade-net"} input.structureType
 * @param {string} input.structureMaterial  "galvanized_iron" | "aluminium" | "bamboo"
 * @param {string} input.stateName
 * @param {number} input.areaSqm
 * @param {number} input.eligibleCostInr  your cost of the parts the norm covers (the build cost without irrigation)
 */
function computeSchemeSubsidy({ structureType, structureMaterial, stateName, areaSqm, eligibleCostInr }) {
  const area = Math.max(0, Number(areaSqm) || 0);
  const ownCost = Math.max(0, Number(eligibleCostInr) || 0);
  const key = normKey(structureType, structureMaterial);
  const specialArea = SPECIAL_AREA_STATES.has(String(stateName || "").trim());
  const notes = [];

  if (area >= NHB_THRESHOLD_SQM) {
    const norm = NHB_NORMS[key];
    const rate = specialArea ? norm.hilly : norm.plain;
    const normCost = round(rate * area);
    const supported = round(Math.min(ownCost, normCost));
    const uncapped = round((ASSISTANCE_PERCENT / 100) * supported);
    if (specialArea) notes.push("Hilly-area rate applied for this state.");
    return {
      scheme: "NHB",
      percent: ASSISTANCE_PERCENT,
      normPerSqmInr: rate,
      eligibleAreaSqm: area,
      normCostInr: normCost,
      ownCostInr: round(ownCost),
      eligibleCostInr: supported,
      amountInr: Math.min(uncapped, NHB_PROJECT_CAP_INR),
      capInr: NHB_PROJECT_CAP_INR,
      cappedAtInr: uncapped > NHB_PROJECT_CAP_INR ? NHB_PROJECT_CAP_INR : null,
      specialArea,
      notes,
      source: SOURCES.nhb,
    };
  }

  const eligibleArea = Math.min(area, STATE_MISSION_MAX_SQM);
  const rate = round(slabRate(MIDH_2025_NORMS[key], eligibleArea) * (specialArea ? SPECIAL_AREA_UPLIFT : 1));
  if (specialArea) notes.push("Rates are 15% higher in NE and Himalayan States and the island UTs.");
  if (eligibleArea > LAST_PUBLISHED_SLAB_SQM) {
    notes.push("The 2025 guidelines publish rates up to 2,500 m2; the 2,500 m2 slab rate is applied up to the 4,000 m2 limit set on 12.08.2025.");
  }
  if (key.endsWith("Bamboo")) notes.push("Bamboo structures: assistance is limited to 10 units of at most 250 m2 each per beneficiary.");
  const normCost = round(rate * eligibleArea);
  // The norm caps the cost the scheme recognises; a smaller real cost is supported as it is.
  const supported = round(Math.min(ownCost, normCost));
  return {
    scheme: "NHM",
    percent: ASSISTANCE_PERCENT,
    normPerSqmInr: rate,
    eligibleAreaSqm: eligibleArea,
    normCostInr: normCost,
    ownCostInr: round(ownCost),
    eligibleCostInr: supported,
    amountInr: round((ASSISTANCE_PERCENT / 100) * supported),
    capInr: null,
    cappedAtInr: null,
    specialArea,
    notes,
    source: SOURCES.stateMission,
  };
}

module.exports = {
  ASSISTANCE_PERCENT,
  MIDH_2025_NORMS,
  NHB_NORMS,
  NHB_PROJECT_CAP_INR,
  NHB_THRESHOLD_SQM,
  SPECIAL_AREA_STATES,
  computeSchemeSubsidy,
  normKey,
};
