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
    // What the planner cannot tell from the shed, by bird type, then for every applicant.
    birdTypeChecks: {
      broiler: "The GR funds desi or improved meat birds; confirm a commercial broiler breed qualifies.",
      "layer-cage": "The GR funds a unit of 5,000 desi or improved layers that lay at least 200 eggs a year.",
      "layer-floor": "The GR funds a unit of 5,000 desi or improved layers that lay at least 200 eggs a year.",
      desi: "The GR funds units of 3,000 or 5,000 desi or improved meat birds.",
    },
    conditions: ["Confirm 2 years of poultry experience or a training certificate, and 20 gunthe of land owned or on a 5-year registered lease."],
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
  "mh-mgpuy-interest": {
    name: "Mukhyamantri Gramin Pashudhan Udyojakta Yojana: interest subvention on a poultry loan",
    state: "Maharashtra",
    interestSubventionPct: 4,
    // The most the subvention pays back over the whole loan.
    capInr: 400000,
    conditions: [
      "Only for a project that has had no other central or state subsidy, so it is an alternative to the capital subsidy above.",
      "Paid back after the whole loan is repaid on time, on the bank's no-dues certificate.",
    ],
    verified: true,
    source: {
      document: "Maharashtra GR DAHD-14017/1/2026-AH4, 9 March 2026, State Plan Scheme, item 5 (unique code 202603091924368401), as amended by the corrigendum of 27 August 2026 (202608271649419545)",
      url: "https://gr.maharashtra.gov.in/Site/Upload/Government%20Resolutions/Marathi/202603091924368401.pdf",
    },
    notes: [
      "4 percentage points off the interest rate on a bank loan for a goat, sheep, cow, buffalo or poultry project, up to Rs 4,00,000 in all.",
      "The corrigendum of 27 August 2026 makes the beneficiary, not the bank, responsible for repaying on time.",
    ],
  },
  "br-broiler-farm": {
    name: "Bihar: subsidy for a broiler farm of 3,000 birds (Saat Nishchay-2)",
    state: "Bihar",
    percent: { general: 30, "sc-st": 50 },
    capInr: null,
    units: { meat: [{ birds: 3000, projectCostInr: 1000000 }] },
    birdTypeChecks: { desi: "The scheme funds a broiler farm; confirm desi birds qualify." },
    conditions: ["Confirm about 16 decimal of land for the shed, and apply on the department's portal when it opens for the year."],
    verified: true,
    source: {
      document: "Bihar Directorate of Animal Husbandry letter 1957 of 23 May 2025, under sanction order 6 SS(6)13/2023-2195 of 20 May 2025",
      url: "https://poultry2026.dreamline.in/Files/Letter%20no.%201957%20ni,%20Dt.%2023.05.2025.pdf",
    },
    notes: [
      "A 3,000-bird broiler unit costs Rs 10,00,000: 30% (up to Rs 3,00,000) for general applicants, 50% (up to Rs 5,00,000) for SC/ST.",
      "Paid in one lump sum once the farm is built. The letter is hosted on the department's application portal, not a gov.in site.",
    ],
  },
  "br-layer-farm": {
    name: "Bihar: Samekit Murgi Vikas Yojana (layer farm)",
    state: "Bihar",
    percent: { general: 30, "sc-st": 40 },
    capInr: null,
    units: {
      layer: [
        { birds: 5000, projectCostInr: 4850000 },
        { birds: 10000, projectCostInr: 10000000 },
      ],
    },
    conditions: ["The farm must run for at least 7 years. Confirm the land and a bank loan before applying."],
    verified: true,
    source: {
      document: "Bihar Directorate of Animal Husbandry letter 1958 of 23 May 2025, under sanction order 6 SS(6)40/2014(Khand)-2200 of 20 May 2025",
      url: "https://poultry2026.dreamline.in/Files/Letter%20no.%201958%20ni%20Dt.%2023.05.2025.pdf",
    },
    notes: [
      "5,000 layers cost Rs 48,50,000 and 10,000 layers Rs 1,00,00,000; the subsidy is 30% for general applicants and 40% for SC/ST.",
      "Paid in two instalments (60% then 40%). The state also pays 50% of the bank loan's interest for 4 years.",
    ],
  },
  "od-pssy-broiler": {
    name: "Odisha: support to farmers for broiler farming (State Plan, 2026-27)",
    state: "Odisha",
    percent: { general: 50, "sc-st": 60 },
    capInr: null,
    units: {
      meat: [
        { birds: 2000, projectCostInr: 720000 },
        { birds: 2500, projectCostInr: 900000 },
        { birds: 3000, projectCostInr: 1080000 },
      ],
    },
    birdTypeChecks: { desi: "The scheme funds broiler units; confirm desi birds qualify." },
    conditions: ["60% also applies to women, transgender people, people with disabilities and women's self-help groups; 50% to other men."],
    verified: true,
    source: {
      document: "Odisha Directorate of AH&VS, guidelines for broiler farming 2026-27, file PT1-AHVS-PD-MISC-0048-2025/01/2026 (May 2026)",
      url: "https://dahvs.odisha.gov.in/dahvsodisha/wp-content/uploads/2026/05/Guidelines-Broiler-Farming.pdf",
    },
    notes: ["Units of 2,000, 2,500 and 3,000 birds cost Rs 7.2, 9.0 and 10.8 lakh. Paid after the work is done, in two halves."],
  },
  "od-pssy-layer": {
    name: "Odisha: support to farmers for layer farming (State Plan, 2026-27)",
    state: "Odisha",
    percent: { general: 50, "sc-st": 60 },
    capInr: null,
    // The guideline costs layers at Rs 8.225 lakh per 1,000 birds, for units of 1,000 to 4,000.
    units: {
      layer: [
        { birds: 1000, projectCostInr: 822500 },
        { birds: 2000, projectCostInr: 1645000 },
        { birds: 3000, projectCostInr: 2467500 },
        { birds: 4000, projectCostInr: 3290000 },
      ],
    },
    conditions: ["60% also applies to women, transgender people, people with disabilities and women's self-help groups; 50% to other men."],
    verified: true,
    source: {
      document: "Odisha Directorate of AH&VS, guidelines for layer farming 2026-27, file PT1-AHVS-PD-MISC-0048-2025/01/2026 (May 2026)",
      url: "https://dahvs.odisha.gov.in/dahvsodisha/wp-content/uploads/2026/05/GUIDELINES-LAYER-FARMING.pdf",
    },
    notes: ["Rs 8.225 lakh per 1,000 layers, in cages or on deep litter, for 1,000 to 4,000 birds. Paid after the work is done, in two halves."],
  },
  "uk-broiler-farm": {
    name: "Uttarakhand: establishment of broiler farms",
    state: "Uttarakhand",
    units: { meat: [{ birds: 500, projectCostInr: 305100, fixedAmountInr: 60000 }] },
    birdTypeChecks: { desi: "The order funds broiler farms; confirm desi birds qualify." },
    conditions: ["A fixed subsidy for a 500-bird unit; confirm the district has places left this year."],
    verified: true,
    source: {
      document: "Uttarakhand GO 1631/XV-1/22-1(15)/2022 of 15 Nov 2022, continued in 2025-26 by GO 1768/XV-1/2025/87507 of 19 Sep 2025",
      url: "https://cdnbbsr.s3waas.gov.in/s31fb2a1c37b18aa4611c3949d6148d0f8/uploads/2025/03/20250321839401877.pdf",
    },
    notes: [
      "A 500-bird unit costs Rs 3,05,100. The subsidy is a fixed Rs 60,000: Rs 15 a bird for 6 batches plus Rs 15,000 for the shed.",
      "In the 9 hill districts there is also a feed subsidy of Rs 10 a bird, up to Rs 30,000 (GO of 19 Sep 2025).",
    ],
  },
  "uk-poultry-policy-2025": {
    name: "Uttarakhand Poultry Development Policy 2025 (commercial layer farm)",
    state: "Uttarakhand",
    percent: { general: 30, "sc-st": 30 },
    capInr: null,
    units: { layer: [{ birds: 30000, projectCostInr: 18000000 }] },
    conditions: [
      "In the hill districts the unit is 15,000 layers costing Rs 1.2 crore, at 40% up to Rs 48 lakh; the figures shown are for the plains.",
      "Expects a bank loan of about 70% of cost, and land owned or on a lease of at least 10 years.",
    ],
    verified: true,
    source: {
      document: "Uttarakhand GO 588/XV-1/25/62949 of 9 Jun 2025 (policy, to 31 Dec 2030); procedure GO 2014/XV-1/2025-93015 of 10 Oct 2025",
      url: "https://cdnbbsr.s3waas.gov.in/s31fb2a1c37b18aa4611c3949d6148d0f8/uploads/2025/06/202506241490430495.pdf",
    },
    notes: ["Plains: 30,000 layers, Rs 1.8 crore, 30% up to Rs 54 lakh. Hills: 15,000 layers, Rs 1.2 crore, 40% up to Rs 48 lakh. Paid 50%, 40% and 10% as the farm comes up."],
  },
  "up-poultry-policy-2022": {
    name: "Uttar Pradesh Poultry Development Policy 2022: interest reimbursement for a layer farm",
    state: "Uttar Pradesh",
    interestSubventionPct: 7,
    units: {
      layer: [
        { birds: 10000, projectCostInr: 9953000, capInr: 1461000 },
        { birds: 30000, projectCostInr: 25669000, capInr: 3771000 },
        { birds: 60000, projectCostInr: 49190000, capInr: 7230000 },
      ],
    },
    conditions: ["One unit per beneficiary, financed 70% by a bank loan; land owned or on a lease of at least 10 years."],
    verified: true,
    source: {
      document: "Uttar Pradesh policy GO 2254/37-2-2022-1(45)/2012TC of 7 Nov 2022; implementing GO 2505/37-2-2022-1(45)/12TC of 29 Dec 2022",
      url: "http://invest.up.gov.in/wp-content/uploads/2023/04/Poultry_Broiler-and-Farm-GO_160423.pdf",
    },
    notes: ["7% interest reimbursed for 5 years on units of 10,000, 30,000 or 60,000 caged layers (Rs 99.53, 256.69 and 491.90 lakh), up to Rs 14.61, 37.71 and 72.30 lakh."],
  },
  "as-poultry-policy-2024": {
    name: "Assam: Policy for Commercialisation of Poultry Sector 2024 (amended 2025)",
    state: "Assam",
    percent: { general: 33, "sc-st": 33 },
    capInr: 50000000,
    minBirds: { meat: 20000, layer: 50000, desi: 20000 },
    conditions: ["Needs a bank term loan or bank guarantee; the eligible cost is checked against the policy's cost per bird."],
    verified: true,
    source: {
      document: "Assam notification VFV.38/2024/1 of 16 Mar 2024, amended by ECF.No. 670980/60 (cited as 3 Nov 2025)",
      url: "https://animalhusbandry.assam.gov.in/sites/default/files/swf1/dms62_amended_poultry_policy.pdf",
    },
    notes: [
      "33% of the capital cost, up to Rs 5 crore, for layer farms of 50,000+ birds and broiler farms of 20,000+, paid 20/40/40 as the farm reaches 20%, 40% and 90% of capacity.",
      "Also a 3% interest subsidy on the term loan and working capital, and a power subsidy of Rs 2 a unit, within Rs 10 crore per project.",
    ],
  },
  "ga-poultry-infrastructure": {
    name: "Goa: Financial Assistance for Infrastructure of Poultry 2018",
    state: "Goa",
    percent: { general: 75, "sc-st": 75 },
    capInr: null,
    units: {
      meat: [{ birds: 2000, projectCostInr: 859400, capInr: 600000 }],
      layer: [{ birds: 4000, projectCostInr: 2870500, capInr: 2100000 }],
    },
    conditions: ["Read from the department's web page, which gives no notification number; confirm the terms with the Directorate of AH&VS."],
    verified: false,
    source: { document: "Goa Directorate of Animal Husbandry & Veterinary Services, scheme page", url: "https://ahvs.goa.gov.in/setting-up-poultry-of-500-broilers-1000-layers/" },
    notes: [
      "75% of infrastructure cost: up to Rs 6 lakh for 2,000 broilers or low-input birds, up to Rs 21 lakh for 4,000 layers on deep litter.",
      "A separate 2018 scheme pays 80% of chick cost and 20% of feed cost each month, up to Rs 56,000 for broilers and Rs 48,000 for layers.",
    ],
  },
  "hp-him-kukkut": {
    name: "Himachal Pradesh: Him Kukkut Palan Yojna (broiler farm)",
    state: "Himachal Pradesh",
    percent: { general: 60, "sc-st": 60 },
    capInr: null,
    units: { meat: [{ birds: 3000, projectCostInr: null }] },
    birdTypeChecks: { desi: "The scheme funds commercial broiler units; confirm desi birds qualify." },
    conditions: [
      "Needs training at a government poultry farm; about 100 farmers are funded a year.",
      "Read from the department's DBT portal, which gives no order number or unit cost; confirm the cap before relying on it.",
    ],
    verified: false,
    source: { document: "Himachal Pradesh Department of Animal Husbandry, DBT portal: broiler establishment", url: "https://hpahdbt.hp.gov.in/Home/broiler_establishment" },
    notes: ["60% subsidy on the capital cost of a 3,000-chick broiler unit, for all categories."],
  },
  "jh-mpvy-poultry": {
    name: "Jharkhand: Mukhyamantri Pashudhan Vikas Yojana (poultry)",
    state: "Jharkhand",
    percent: { general: 75, "sc-st": 90 },
    capInr: null,
    units: {
      meat: [{ birds: 500, projectCostInr: 67500 }],
      desi: [{ birds: 400, projectCostInr: 118200 }],
    },
    conditions: [
      "90% also applies to destitute widows, people with disabilities and childless couples under 50.",
      "From the department's scheme handbill, not the order itself; confirm the terms with the district office.",
    ],
    verified: false,
    source: { document: "Jharkhand Directorate of Animal Husbandry, Mukhyamantri Pashudhan Vikas Yojana handbill (2025-26)", url: "https://cdn.s3waas.gov.in/s369421f032498c97020180038fddb8e24/uploads/2025/09/17583690561555.pdf" },
    notes: ["A 500-chick broiler unit with shed costs Rs 67,500; a 400-chick low-input desi unit with cage Rs 1,18,200."],
  },
  "tn-country-chicken": {
    name: "Tamil Nadu: 50% subsidy for a 250-bird country chicken farm",
    state: "Tamil Nadu",
    percent: { general: 50, "sc-st": 50 },
    capInr: null,
    units: { desi: [{ birds: 250, projectCostInr: 331250 }] },
    conditions: [
      "Needs 625 sq ft of the applicant's own land.",
      "From a District Collector's press release, not the Government Order; confirm with the district's Animal Husbandry office.",
    ],
    verified: false,
    source: { document: "Nagapattinam District Collector press release 04 of 3 Jul 2025 (2025-26; continued in 2026-27)", url: "https://cdn.s3waas.gov.in/s3c203d8a151612acf12457e4d67635a95/uploads/2025/07/2025070315.pdf" },
    notes: ["A 250-bird country chicken unit costs Rs 3,31,250 (shed, equipment and 4 months of feed); the subsidy is 50%, Rs 1,65,625."],
  },
  "ar-anppy-poultry": {
    name: "Arunachal Pradesh: Atma Nirbhar Pashu Palan Yojna (poultry)",
    state: "Arunachal Pradesh",
    percent: { general: 45, "sc-st": 45 },
    capInr: 675000,
    conditions: [
      "For unemployed Arunachal Scheduled Tribe applicants with a land certificate who are not bank defaulters; 45% bank loan and 10% own share.",
      "From one district's circular (Lohit, 2025-26); unit costs may differ by district, so confirm with the district veterinary office.",
    ],
    verified: false,
    source: { document: "District AH & Veterinary Officer, Lohit: ANPPY 2025-26 circular of 28 Oct 2025 (memo LV/DEV/ANPPY/2025-26/313-29)", url: "https://cdn.s3waas.gov.in/s3c0c7c76d30bd3dcaefc96f40275bdc0a/uploads/2025/10/17617956647686.pdf" },
    notes: ["A Rs 5 lakh poultry unit gets Rs 2,25,000 and a Rs 15 lakh entrepreneurship unit Rs 6,75,000, at 45%."],
  },
};

/** Bird types counted as layers by a state scheme that funds meat and layer units separately. */
const LAYER_TYPES = ["layer-cage", "layer-floor"];

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

/** The unit a state scheme funds that is closest to this flock (the larger one when the size is not known). */
function nearestUnit(units, birds) {
  if (!(birds > 0)) return units[units.length - 1];
  return units.reduce((best, unit) => (Math.abs(unit.birds - birds) < Math.abs(best.birds - birds) ? unit : best));
}

const KIND_NAMES = { meat: "meat-bird", layer: "layer", desi: "desi" };

/** Layers count as layer units; desi birds use the order's desi units when it has them, else its meat-bird units. */
function unitKind(rule, birdType) {
  if (LAYER_TYPES.includes(birdType)) return "layer";
  if (birdType === "desi" && rule.units?.desi) return "desi";
  return "meat";
}

/**
 * A state's own scheme, shown only in that state and always "check": the planner cannot know the applicant's
 * experience, land or category papers. Units are what the order funds, by kind (meat, layer, desi); a kind it does not
 * fund, or a flock below its minimum, is "not-eligible". A capital subsidy is a share of the capital cost, capped at the
 * lowest of that share of the nearest unit's fixed project cost, the unit's own cap and the order's cap; a unit with a
 * fixed amount pays that amount; an interest subvention pays nothing up front and reports its rate and limit.
 */
function checkStateScheme(id, project) {
  const rule = SCHEMES[id];
  const base = { id, name: rule.name, verified: rule.verified, notes: rule.notes, source: rule.source };
  const percent = rule.percent ? rule.percent[category(project.category)] : null;
  const kind = unitKind(rule, project.birdType);
  const units = rule.units ? rule.units[kind] : null;
  const notEligible = (reason) => ({ ...base, status: "not-eligible", reasons: [reason], percent, capInr: null, amountInr: 0, cappedAtInr: null, interestSubventionPct: null });
  if (rule.units && !units) return notEligible(`The order funds only ${Object.keys(rule.units).map((k) => KIND_NAMES[k]).join(" and ")} units.`);
  const birds = Number(project.flockSize);
  const minBirds = rule.minBirds?.[kind];
  if (minBirds && birds > 0 && birds < minBirds) return notEligible(`The order is for farms of at least ${minBirds.toLocaleString("en-IN")} birds.`);
  const unit = units ? nearestUnit(units, birds) : null;
  const reasons = [rule.birdTypeChecks?.[project.birdType], ...(rule.conditions || [])].filter(Boolean);
  const check = { ...base, status: "check", reasons, interestSubventionPct: null };
  if (rule.interestSubventionPct) {
    return { ...check, percent: null, capInr: unit?.capInr ?? rule.capInr ?? null, amountInr: 0, cappedAtInr: null, interestSubventionPct: rule.interestSubventionPct };
  }
  if (unit?.fixedAmountInr) return { ...check, percent: null, capInr: unit.fixedAmountInr, amountInr: unit.fixedAmountInr, cappedAtInr: null };
  const caps = [unit?.projectCostInr != null ? round((percent / 100) * unit.projectCostInr) : null, unit?.capInr, rule.capInr].filter((v) => v != null);
  const cap = caps.length > 0 ? Math.min(...caps) : null;
  const share = round((percent / 100) * Math.max(0, Number(project.capitalCostInr) || 0));
  const capped = cap != null && share > cap;
  return { ...check, percent, capInr: cap, amountInr: capped ? cap : share, cappedAtInr: capped ? cap : null };
}

/**
 * Every scheme that could apply to this project, with a verdict for each: "eligible", "check" (depends on
 * something the planner does not know yet, or on unverified rules) or "not-eligible" (with the reasons).
 * @param {object} project
 * @param {"broiler"|"layer-cage"|"layer-floor"|"desi"} project.birdType
 * @param {string} project.state
 * @param {"general"|"sc-st"} [project.category]
 * @param {number} project.capitalCostInr   the capital cost a scheme would support (no working capital or land)
 * @param {number} [project.flockSize]       for a state scheme with fixed unit costs (picks the unit size)
 * @param {boolean} [project.lowInputBreed]  for NLM
 * @param {boolean} [project.hasHatchery]    for NLM
 * @param {number} [project.parentFemales]   for NLM
 * @param {number} [project.parentMales]     for NLM
 * @param {boolean} [project.greenfield]     for NLM
 * @param {boolean} [project.includesFeedOrProcessing]  for AHIDF
 */
function computeSchemes(project) {
  const state = String(project.state || "").trim();
  const schemes = [checkNlm(project), checkAhidf(project)];
  for (const [id, rule] of Object.entries(SCHEMES)) {
    if (rule.state && rule.state === state) schemes.push(checkStateScheme(id, project));
  }
  const usable = schemes.filter((scheme) => scheme.status !== "not-eligible");
  return {
    schemes,
    // Nothing to claim: say so instead of inventing a subsidy. The bank loan carries the project.
    noneApplies: usable.length === 0,
    bestAmountInr: usable.reduce((best, scheme) => Math.max(best, scheme.amountInr), 0),
  };
}

module.exports = { SCHEMES, NLM_BIRD_TYPES, computeSchemes };
