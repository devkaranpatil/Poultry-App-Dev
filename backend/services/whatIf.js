// "What if" questions in the chat ("what if I build 500 m2 of fan and pad?", "and at Rs 40 a kilo?") are answered
// by the planner, not by the language model: the model only turns the question into a list of changes (constrained
// to WHAT_IF_SCHEMA), the calculator and the returns arithmetic produce both sets of figures, and the model is told
// to quote them. So every number in such an answer comes from code.

const INDIA_LOCATIONS = require("../../shared/india-locations.json");
const { computeReturns } = require("./returns");

// A cheap first check, so ordinary questions never pay for the extraction step.
const WHAT_IF_HINT =
  /\b(what if|what happens|suppose|supposing|instead|switch(?:ed|ing)? to|change|if i|if we|bigger|smaller|larger|double|half|increase|decrease|reduce|raise|lower|compare|would it|how much (?:more|less))\b|अगर|यदि|बदल|जर\s|त्याऐवजी/i;

const looksLikeWhatIf = (text) => WHAT_IF_HINT.test(String(text || ""));

const UNCHANGED = "unchanged";
const option = (values) => ({ enum: [UNCHANGED, ...values] });
const numberOrNull = { type: ["number", "null"] };

/** What the model fills in: every field present; "unchanged" or null when the question does not change it. */
const WHAT_IF_SCHEMA = {
  type: "object",
  properties: {
    isWhatIf: { type: "boolean" },
    lengthM: numberOrNull,
    widthM: numberOrNull,
    areaSqm: numberOrNull,
    greenhouseType: option(["naturally-ventilated", "climate-controlled", "shade-net"]),
    roofType: option(["flat", "gable", "gothic"]),
    structureMaterial: option(["gi-steel", "aluminium", "bamboo"]),
    coverMaterial: option(["uv-polyfilm", "shade-net", "insect-net", "glass"]),
    selectedCrop: option(["tomato", "capsicum", "cucumber", "lettuce", "strawberry", "gerbera"]),
    irrigationSystem: option(["drip", "sprinkler", "fogger", "hydroponic-nft"]),
    state: option(Object.keys(INDIA_LOCATIONS)),
    yieldPerSqm: numberOrNull,
    pricePerUnit: numberOrNull,
    subsidyPct: numberOrNull,
    operatingCostPct: numberOrNull,
  },
};

const EXTRACTION_SYSTEM = [
  "You turn a farmer's question about their polyhouse project into the change they are asking about.",
  "Set isWhatIf to true only if the question asks what would happen with a different size, structure, material, crop, irrigation, state, yield, price, subsidy or running cost.",
  "Fill only the fields the question changes; leave every other field \"unchanged\" or null. Sizes are in metres or square metres; yield in kg (or stems) per square metre per year; price in rupees per kg (or per stem); subsidy and running cost in percent.",
].join(" ");

// The words that name each option. A small model fills fields nobody asked about (in testing it turned "switch to
// bamboo" into bamboo + fan and pad + flat roof + glass), so an option change counts only when the question names it.
const OPTION_WORDS = {
  greenhouseType: {
    "climate-controlled": /fan[\s-]*(and|&|n)?[\s-]*pad|climate[\s-]*control|cooling pads?/i,
    "shade-net": /shade[\s-]*net/i,
    "naturally-ventilated": /natural(ly)?[\s-]*ventilat/i,
  },
  roofType: { flat: /flat\s*roof/i, gothic: /gothic|arched?\s*roof/i, gable: /gable/i },
  structureMaterial: { bamboo: /bamboo/i, aluminium: /alumin/i, "gi-steel": /\bG\.?I\.?\b|galvani[sz]ed|steel/i },
  coverMaterial: { glass: /glass/i, "insect-net": /insect[\s-]*net/i, "uv-polyfilm": /poly[\s-]*film|polythene|plastic film/i },
  selectedCrop: Object.fromEntries(["tomato", "capsicum", "cucumber", "lettuce", "strawberry", "gerbera"].map((crop) => [crop, new RegExp(crop, "i")])),
  irrigationSystem: { drip: /\bdrip/i, sprinkler: /sprinkl/i, fogger: /fogg/i, "hydroponic-nft": /\bNFT\b|hydroponic/i },
  state: Object.fromEntries(Object.keys(INDIA_LOCATIONS).map((state) => [state, new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")])),
};

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const numbersIn = (text) =>
  new Set(
    [...String(text).replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit))).replace(/(\d),(\d)/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map(
      (match) => Number(match[0])
    )
  );

/**
 * Keeps only what the question really says: an option counts when the question names it (and is added when the
 * model missed the only option named for that field), a number counts when it appears in the question.
 * @param {object} extracted  the model's reading
 * @param {string} question   the question, with Hindi and Marathi farming words already in English
 */
function groundExtraction(extracted, question) {
  const grounded = { ...extracted };
  for (const [field, words] of Object.entries(OPTION_WORDS)) {
    const named = Object.keys(words).filter((value) => words[value].test(question));
    const chosen = extracted[field];
    if (chosen && chosen !== UNCHANGED && !named.includes(chosen)) grounded[field] = UNCHANGED;
    if ((!chosen || chosen === UNCHANGED || !named.includes(chosen)) && named.length === 1) grounded[field] = named[0];
  }
  const numbers = numbersIn(question);
  for (const field of ["lengthM", "widthM", "areaSqm", ...ASSUMPTION_FIELDS]) {
    if (typeof grounded[field] === "number" && !numbers.has(grounded[field])) grounded[field] = null;
  }
  return grounded;
}

const round1 = (value) => Math.round(value * 10) / 10;
const CONFIG_FIELDS = ["greenhouseType", "roofType", "structureMaterial", "coverMaterial", "selectedCrop", "irrigationSystem"];
const ASSUMPTION_FIELDS = ["yieldPerSqm", "pricePerUnit", "subsidyPct", "operatingCostPct"];
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The project's setup with the extracted changes applied, and a readable list of what changed.
 * @param {object} rawConfig  the setup as the client sent it (stateName, doorType, ...)
 */
function applyChanges(rawConfig, extracted) {
  const config = { ...rawConfig };
  const changes = [];
  for (const field of CONFIG_FIELDS) {
    const next = extracted[field];
    if (next && next !== UNCHANGED && next !== rawConfig[field]) {
      changes.push({ field, from: rawConfig[field] ?? null, to: next });
      config[field] = next;
    }
  }
  // The browser sends stateName (toFarmPayload); older clients and tests send state.
  const currentState = rawConfig.stateName ?? rawConfig.state ?? null;
  if (extracted.state && extracted.state !== UNCHANGED && extracted.state !== currentState) {
    changes.push({ field: "state", from: currentState, to: extracted.state });
    config.stateName = extracted.state;
    config.state = extracted.state;
    config.district = ""; // the old district is in the old state
  }

  const length = Number(rawConfig.length);
  const width = Number(rawConfig.width);
  if (positive(extracted.lengthM) || positive(extracted.widthM)) {
    config.length = positive(extracted.lengthM) ? extracted.lengthM : length;
    config.width = positive(extracted.widthM) ? extracted.widthM : width;
  } else if (positive(extracted.areaSqm) && length > 0 && width > 0) {
    // A new floor area keeps the house's proportions.
    const scale = Math.sqrt(extracted.areaSqm / (length * width));
    config.length = Math.round(length * scale * 2) / 2;
    config.width = Math.round(width * scale * 2) / 2;
  }
  if (Number(config.length) !== length || Number(config.width) !== width) {
    changes.push({ field: "size", from: `${length} x ${width} m`, to: `${config.length} x ${config.width} m` });
  }
  return { config, changes };
}

/**
 * The figures the chat quotes, for one setup and one set of planning assumptions. With `profitComparable` false
 * (another crop, no yield or price given) cost, subsidy and net investment still count; profit and payback do not.
 */
function figures(result, assumptions, profitComparable = true) {
  const returns = assumptions
    ? computeReturns({
        capitalCost: result.cost.totalCost,
        areaSqm: result.area,
        scheme: result.subsidy,
        subsidyPct: assumptions.subsidyPct,
        yieldPerSqm: assumptions.yieldPerSqm,
        pricePerUnit: assumptions.pricePerUnit,
        operatingCostPct: assumptions.operatingCostPct,
      })
    : null;
  return {
    areaSqm: result.area,
    totalCostInr: result.cost.totalCost,
    subsidyScheme: result.subsidy?.scheme ?? null,
    subsidyInr: Math.round(returns ? returns.subsidyAmount : result.subsidy?.amountInr ?? 0),
    netInvestmentInr: returns ? Math.round(returns.netInvestment) : null,
    annualProfitInr: returns && profitComparable ? Math.round(returns.annualProfit) : null,
    paybackYears: returns && profitComparable && returns.paybackYears !== null ? round1(returns.paybackYears) : null,
  };
}

const assumptionsFrom = (financials) =>
  financials && ASSUMPTION_FIELDS.every((field) => typeof financials[field] === "number")
    ? Object.fromEntries(ASSUMPTION_FIELDS.map((field) => [field, financials[field]]))
    : null;

/**
 * Both sets of figures for a what-if: the project as it is, and with the changes. Null when the question is not
 * a what-if or changes nothing; { error } when the changed setup is not valid (the planner's own message).
 * @param {{ rawConfig: object, financials: object|null, extracted: object, runCalculation: Function }} input
 */
function planScenario({ rawConfig, financials, extracted: modelReading, question, runCalculation }) {
  if (!modelReading || modelReading.isWhatIf !== true) return null;
  // With the question at hand, keep only the changes it really asks for (see groundExtraction).
  const extracted = question === undefined ? modelReading : groundExtraction(modelReading, question);
  const { config, changes } = applyChanges(rawConfig, extracted);

  const baseAssumptions = assumptionsFrom(financials);
  const nextAssumptions = baseAssumptions ? { ...baseAssumptions } : null;
  let note = null;
  let profitComparable = true;
  for (const field of ASSUMPTION_FIELDS) {
    const value = extracted[field];
    // A value equal to today's is the model repeating the project, not a change.
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value !== baseAssumptions?.[field]) {
      changes.push({ field, from: baseAssumptions?.[field] ?? null, to: extracted[field] });
      if (nextAssumptions) nextAssumptions[field] = extracted[field];
    }
  }
  if (changes.length === 0) return null;
  // Another crop sells at another yield and price; without them the returns would compare apples and oranges.
  const cropChanged = changes.some((change) => change.field === "selectedCrop");
  if (cropChanged && nextAssumptions && typeof extracted.yieldPerSqm !== "number" && typeof extracted.pricePerUnit !== "number") {
    profitComparable = false;
    note = "The crop changes, so profit and payback are not compared: give the new crop's yield and price to compare them.";
  }

  const baseline = runCalculation(rawConfig);
  const scenario = runCalculation(config);
  if (baseline.errors) return null;
  if (scenario.errors) return { changes, error: Object.values(scenario.errors)[0] };
  return {
    changes,
    baseline: figures(baseline.result, baseAssumptions),
    scenario: figures(scenario.result, nextAssumptions, profitComparable),
    note,
  };
}

const inr = (value) => (value === null ? "not compared" : `Rs ${Math.round(value).toLocaleString("en-IN")}`);
const years = (value) => (value === null ? "no payback or not compared" : `${value} years`);

/** The prompt block the model must quote from. */
function scenarioBlock(plan) {
  const changeText = plan.changes.map((change) => `${change.field}: ${change.from ?? "not set"} -> ${change.to}`).join("; ");
  if (plan.error) {
    return `PLANNER WHAT-IF: the planner cannot calculate this change (${changeText}): ${plan.error}. Say so and do not estimate figures.`;
  }
  const rows = [
    ["Floor area", `${plan.baseline.areaSqm} m2`, `${plan.scenario.areaSqm} m2`],
    ["Total build cost", inr(plan.baseline.totalCostInr), inr(plan.scenario.totalCostInr)],
    ["Subsidy", `${inr(plan.baseline.subsidyInr)} (${plan.baseline.subsidyScheme ?? "-"})`, `${inr(plan.scenario.subsidyInr)} (${plan.scenario.subsidyScheme ?? "-"})`],
    ["Net investment", inr(plan.baseline.netInvestmentInr), inr(plan.scenario.netInvestmentInr)],
    ["Yearly profit", inr(plan.baseline.annualProfitInr), inr(plan.scenario.annualProfitInr)],
    ["Payback", years(plan.baseline.paybackYears), years(plan.scenario.paybackYears)],
  ];
  return [
    `PLANNER WHAT-IF (calculated by the planner; quote these figures exactly and do not calculate your own). Change: ${changeText}.`,
    ...rows.map(([label, now, next]) => `${label}: now ${now}; with the change ${next}`),
    plan.note ? `Note: ${plan.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { EXTRACTION_SYSTEM, WHAT_IF_SCHEMA, applyChanges, groundExtraction, looksLikeWhatIf, planScenario, scenarioBlock };
