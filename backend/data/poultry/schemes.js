// Government support for a poultry project: which schemes it qualifies for and what each gives.
// Poultry has no single scheme like MIDH, so every scheme is checked and the answer says plainly
// when none applies. Pure data and arithmetic; the same rows are in datasets/csv/poultry_scheme_rules.csv
// (a test keeps them equal). See docs/migration/research.md, section 1.

const SCHEMES = {
  "nlm-edp-rural-poultry": {
    name: "National Livestock Mission, Entrepreneurship Development Programme: Rural Poultry",
    percent: { general: 50, "sc-st": 50 },
    capInr: 2500000,
    minOwnContributionPct: 10,
    minParentFemales: 1000,
    minParentMales: 100,
    greenfieldOnly: true,
    minYearsOperation: 3,
    verified: true,
    source: {
      document: "NLM-EDP guideline 2021-26 (KLDB, revised Aug 2024)",
      url: "https://livestock.kerala.gov.in/wp-content/uploads/2024/07/KLDB-NLM-GUIDELINE.pdf",
    },
    notes: [
      "Back-ended: paid in two instalments through SIDBI, the first after the bank has released at least 25% of the loan.",
      "Not for working capital, land, land lease or personal vehicles.",
      "The farm must run for at least 3 years after completion.",
    ],
  },
  ahidf: {
    name: "Animal Husbandry Infrastructure Development Fund",
    interestSubventionPct: 3,
    maxLoanPctOfCost: 90,
    minOwnContributionPct: 10,
    maxRepaymentYears: 8,
    moratoriumYears: 2,
    verified: true,
    source: { document: "AHIDF Guidelines", url: "https://www.gadvasu.in/assests/uploads/images/Guidelines%20AHIDF.pdf" },
    notes: ["3% interest subvention on a loan of up to 90% of cost, repaid over up to 8 years including 2 years of moratorium."],
  },
  "mh-mgpuy-poultry": {
    name: "Mukhyamantri Gramin Pashudhan Udyojak Yojana (poultry)",
    state: "Maharashtra",
    percent: { general: 50, "sc-st": 75 },
    capInr: null,
    verified: false,
    source: { document: "Third-party summaries of the 2026 scheme; official GR not yet found", url: "https://www.govtschemes.in/node/139909" },
    notes: [
      "Unverified: the figures come from secondary summaries until the official GR is found.",
      "Applied on MahaDBT; beneficiaries are chosen by lottery.",
      "Needs 2 years of experience or training, and land owned or on a 5-year registered lease.",
    ],
  },
};

/** Bird types a rural poultry parent farm can keep (NLM-EDP provides for layer farms only). */
const NLM_BIRD_TYPES = ["desi", "layer-cage", "layer-floor"];

const round = (value) => Math.round(value);
const category = (value) => (value === "sc-st" ? "sc-st" : "general");

/** NLM-EDP: only a rural parent farm of Low Input Technology birds, with a hatchery, qualifies. */
function checkNlm(project) {
  const rule = SCHEMES["nlm-edp-rural-poultry"];
  const reasons = [];
  let status = "eligible";
  const fail = (reason) => {
    status = "not-eligible";
    reasons.push(reason);
  };
  const unknown = (reason) => {
    if (status === "eligible") status = "check";
    reasons.push(reason);
  };

  if (!NLM_BIRD_TYPES.includes(project.birdType)) fail("Covers only a rural poultry parent farm of Low Input Technology birds, not a commercial broiler farm.");
  if (project.lowInputBreed === false) fail("The birds must be a Low Input Technology breed (Vanaraja, Kaveri, Gramapriya type).");
  else if (project.lowInputBreed === undefined) unknown("Confirm the birds are a Low Input Technology breed.");
  if (project.hasHatchery === false) fail("The unit must include a hatchery and a brooder-mother unit.");
  else if (project.hasHatchery === undefined) unknown("Confirm the project includes a hatchery and a brooder-mother unit.");
  const females = Number(project.parentFemales);
  const males = Number(project.parentMales);
  if (project.parentFemales !== undefined && project.parentMales !== undefined && Number.isFinite(females) && Number.isFinite(males)) {
    if (females < rule.minParentFemales || males < rule.minParentMales) {
      fail(`Needs at least ${rule.minParentFemales} female and ${rule.minParentMales} male parent birds.`);
    }
  } else {
    unknown(`Confirm at least ${rule.minParentFemales} female and ${rule.minParentMales} male parent birds.`);
  }
  if (project.greenfield === false) fail("Only new (green-field) projects qualify, not expansions.");

  const cost = Math.max(0, Number(project.capitalCostInr) || 0);
  const percent = rule.percent[category(project.category)];
  const uncapped = round((percent / 100) * cost);
  return {
    id: "nlm-edp-rural-poultry",
    name: rule.name,
    status,
    reasons,
    percent,
    capInr: rule.capInr,
    amountInr: status === "not-eligible" ? 0 : Math.min(uncapped, rule.capInr),
    cappedAtInr: status !== "not-eligible" && uncapped > rule.capInr ? rule.capInr : null,
    interestSubventionPct: null,
    verified: rule.verified,
    notes: rule.notes,
    source: rule.source,
  };
}

/** AHIDF: an interest subvention for feed plants and meat processing, never for the farm itself. */
function checkAhidf(project) {
  const rule = SCHEMES.ahidf;
  const eligible = project.includesFeedOrProcessing === true;
  return {
    id: "ahidf",
    name: rule.name,
    status: eligible ? "eligible" : "not-eligible",
    reasons: eligible ? [] : ["Supports feed plants and meat processing units, not the poultry farm itself."],
    percent: null,
    capInr: null,
    amountInr: 0,
    cappedAtInr: null,
    interestSubventionPct: eligible ? rule.interestSubventionPct : null,
    verified: rule.verified,
    notes: rule.notes,
    source: rule.source,
  };
}

/** Maharashtra's state scheme: shown only there, and always to be checked until the GR is found. */
function checkMaharashtra(project) {
  const rule = SCHEMES["mh-mgpuy-poultry"];
  const percent = rule.percent[category(project.category)];
  const cost = Math.max(0, Number(project.capitalCostInr) || 0);
  return {
    id: "mh-mgpuy-poultry",
    name: rule.name,
    status: "check",
    reasons: ["Confirm the unit size and the cost the scheme allows in the official GR."],
    percent,
    capInr: null,
    amountInr: round((percent / 100) * cost),
    cappedAtInr: null,
    interestSubventionPct: null,
    verified: rule.verified,
    notes: rule.notes,
    source: rule.source,
  };
}

/**
 * Every scheme that could apply to this project, with a verdict for each: "eligible", "check" (depends on
 * something the planner does not know yet, or on unverified rules) or "not-eligible" (with the reasons).
 * @param {object} project
 * @param {"broiler"|"layer-cage"|"layer-floor"|"desi"} project.birdType
 * @param {string} project.state
 * @param {"general"|"sc-st"} [project.category]
 * @param {number} project.capitalCostInr   the capital cost a scheme would support (no working capital or land)
 * @param {boolean} [project.lowInputBreed]  for NLM
 * @param {boolean} [project.hasHatchery]    for NLM
 * @param {number} [project.parentFemales]   for NLM
 * @param {number} [project.parentMales]     for NLM
 * @param {boolean} [project.greenfield]     for NLM
 * @param {boolean} [project.includesFeedOrProcessing]  for AHIDF
 */
function computeSchemes(project) {
  const schemes = [checkNlm(project), checkAhidf(project)];
  if (String(project.state || "").trim() === SCHEMES["mh-mgpuy-poultry"].state) schemes.push(checkMaharashtra(project));
  const usable = schemes.filter((scheme) => scheme.status !== "not-eligible");
  return {
    schemes,
    // Nothing to claim: say so instead of inventing a subsidy. The bank loan carries the project.
    noneApplies: usable.length === 0,
    bestAmountInr: usable.reduce((best, scheme) => Math.max(best, scheme.amountInr), 0),
  };
}

module.exports = { SCHEMES, NLM_BIRD_TYPES, computeSchemes };
