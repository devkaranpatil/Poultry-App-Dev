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
    name: "Mukhyamantri Gramin Pashudhan Udyojakta Yojana (poultry)",
    state: "Maharashtra",
    percent: { general: 50, "sc-st": 75 },
    // The subsidy is a share of a fixed project cost per unit (below), so there is no single cap.
    capInr: null,
    // Project cost the GR fixes for each unit it funds, by the kind of flock.
    units: {
      meat: [
        { birds: 3000, projectCostInr: 1200000 },
        { birds: 5000, projectCostInr: 1900000 },
      ],
      layer: [{ birds: 5000, projectCostInr: 3000000 }],
    },
    verified: true,
    source: {
      document: "Maharashtra GR DAHD-14017/1/2026-AH4, 9 March 2026, State Plan Scheme (unique code 202603091924368401), as amended by the corrigendum of 27 August 2026 (202608271649419545)",
      url: "https://gr.maharashtra.gov.in/Site/Upload/Government%20Resolutions/Marathi/202603091924368401.pdf",
    },
    notes: [
      "Read from the GR on gr.maharashtra.gov.in. The corrigendum of 27 August 2026 changes nothing for poultry.",
      "The GR funds two kinds of unit: 5,000 egg-laying desi or improved birds (project Rs 30,00,000) and 3,000 or 5,000 desi or improved meat birds (Rs 12,00,000 and Rs 19,00,000).",
      "Paid in two halves: the first after the shed is built, the second after the equipment and birds are bought. The shed must be started within 2 months of selection.",
      "Needs 2 years of poultry experience or a training certificate, and at least 20 gunthe of land owned or on a 5-year registered lease, plus a bank loan sanction.",
      "50% of places are kept for women and 5% for people with disabilities.",
      "Applications are made online once a year; since the corrigendum of 27 August 2026 they are chosen first come, first served (it was a random draw). One person per family, and not for anyone who had a similar scheme in the last 3 years. Not in Mumbai or Mumbai Suburban.",
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

/** The unit the GR funds that is closest to this flock (the larger one when the size is not known). */
function maharashtraUnit(kind, birds) {
  const units = SCHEMES["mh-mgpuy-poultry"].units[kind];
  if (!(birds > 0)) return units[units.length - 1];
  return units.reduce((best, unit) => (Math.abs(unit.birds - birds) < Math.abs(best.birds - birds) ? unit : best));
}

/**
 * Maharashtra's state scheme, from the GR of 9 March 2026: shown only there, and always "check" because the planner
 * cannot know the applicant's experience, land or whether the breed counts as desi or improved. The subsidy is a share
 * of the GR's fixed project cost for the unit, so it never exceeds that share whatever the project costs.
 */
function checkMaharashtra(project) {
  const rule = SCHEMES["mh-mgpuy-poultry"];
  const percent = rule.percent[category(project.category)];
  const cost = Math.max(0, Number(project.capitalCostInr) || 0);
  const layer = project.birdType === "layer-cage" || project.birdType === "layer-floor";
  const unit = maharashtraUnit(layer ? "layer" : "meat", Number(project.flockSize));
  const cap = round((percent / 100) * unit.projectCostInr);
  const share = round((percent / 100) * cost);
  const reasons = [];
  if (project.birdType === "broiler") reasons.push("The GR funds desi or improved meat birds; confirm a commercial broiler breed qualifies.");
  if (layer) reasons.push("The GR funds a unit of 5,000 desi or improved layers that lay at least 200 eggs a year.");
  if (project.birdType === "desi") reasons.push("The GR funds units of 3,000 or 5,000 desi or improved meat birds.");
  reasons.push("Confirm 2 years of poultry experience or a training certificate, and 20 gunthe of land owned or on a 5-year registered lease.");
  return {
    id: "mh-mgpuy-poultry",
    name: rule.name,
    status: "check",
    reasons,
    percent,
    capInr: cap,
    amountInr: Math.min(share, cap),
    cappedAtInr: share > cap ? cap : null,
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
 * @param {number} [project.flockSize]       for the Maharashtra scheme (picks the unit size)
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
