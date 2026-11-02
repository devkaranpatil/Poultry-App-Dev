// "What if" questions in the chat ("what if I keep 5,000 broilers?", "and on contract?", "at Rs 110 a kilo?") are
// answered by the planner, not by the language model: the model only turns the question into a list of changes
// (constrained to WHAT_IF_SCHEMA), the poultry calculator produces both sets of figures, and the model is told to
// quote them. So every number in such an answer comes from code.

const INDIA_LOCATIONS = require("../../shared/india-locations.json");
const { floorAreaFor } = require("./flock");
const { defaultAssumptions } = require("./poultry/production");
const { NORMS } = require("../data/poultry/norms");

// A cheap first check, so ordinary questions never pay for the extraction step.
const WHAT_IF_HINT =
  /\b(what if|what happens|suppose|supposing|instead|switch(?:ed|ing)? to|change|if i|if we|bigger|smaller|larger|double|half|increase|decrease|reduce|raise|lower|compare|would it|how much (?:more|less))\b|\bwould\b[^.?]*\b(?:cost|earn|make|pay|profit)\b|अगर|यदि|बदल|जर\s|त्याऐवजी/i;

const looksLikeWhatIf = (text) => WHAT_IF_HINT.test(String(text || ""));

const UNCHANGED = "unchanged";
const option = (values) => ({ enum: [UNCHANGED, ...values] });
const numberOrNull = { type: ["number", "null"] };

const BIRD_TYPES = Object.keys(NORMS.birdTypes);
const ASSUMPTION_FIELDS = ["saleInrPerKg", "eggInr", "growingChargeInrPerKg", "feedInrPerKg", "chickInr", "mortalityPct", "subsidyInr"];

/** What the model fills in: every field present; "unchanged" or null when the question does not change it. */
const WHAT_IF_SCHEMA = {
  type: "object",
  properties: {
    isWhatIf: { type: "boolean" },
    birds: numberOrNull,
    lengthM: numberOrNull,
    widthM: numberOrNull,
    areaSqm: numberOrNull,
    birdType: option(BIRD_TYPES),
    housingSystem: option(["open-sided", "environment-controlled", "backyard"]),
    farmingModel: option(["independent", "contract"]),
    roofType: option(["gable", "monitor", "lean-to"]),
    roofSheet: option(["gi-sheet", "galvalume", "fibre-cement", "puf-panel", "thatch"]),
    feedingSystem: option(["manual", "semi-auto", "automatic", "trough"]),
    state: option(Object.keys(INDIA_LOCATIONS)),
    ...Object.fromEntries(ASSUMPTION_FIELDS.map((field) => [field, numberOrNull])),
  },
};

const EXTRACTION_SYSTEM = [
  "You turn a farmer's question about their poultry farm project into the change they are asking about.",
  "Set isWhatIf to true only if the question asks what would happen with a different flock size, shed size, bird type, shed type, contract or independent farming, roof, feeding system, state, price, mortality or subsidy.",
  "Fill only the fields the question changes; leave every other field \"unchanged\" or null. birds is the number of birds; sizes are in metres or square metres; saleInrPerKg is the live-bird price in rupees per kg, eggInr the price of one egg, growingChargeInrPerKg the integrator's growing charge per kg, feedInrPerKg and chickInr the feed and chick prices, mortalityPct in percent, subsidyInr in rupees.",
].join(" ");

// The words that name each option. A small model fills fields nobody asked about, so an option change counts only
// when the question names it.
const OPTION_WORDS = {
  birdType: {
    broiler: /\bbroilers?\b/i,
    "layer-cage": /\bcages?\b|\blayers?\b(?![^.?]*\b(floor|deep[\s-]*litter)\b)/i,
    "layer-floor": /\blayers?\b[^.?]*\b(floor|deep[\s-]*litter)\b|\b(floor|deep[\s-]*litter)\b[^.?]*\blayers?\b/i,
    desi: /\bdesi\b|vanaraja|kaveri|giriraja|gramapriya|kadaknath|country (chicken|bird)|indigenous/i,
  },
  housingSystem: {
    "environment-controlled": /environment[\s-]*controlled|\bEC\b|tunnel|cooling pads?|climate[\s-]*control/i,
    "open-sided": /open[\s-]*(sided|shed|house)/i,
    backyard: /backyard/i,
  },
  farmingModel: { contract: /contract|integrator/i, independent: /independent|on my own|without (an )?integrator/i },
  roofType: { monitor: /monitor/i, gable: /gable/i, "lean-to": /lean[\s-]*to/i },
  roofSheet: {
    "gi-sheet": /\bG\.?I\.?\b|galvani[sz]ed/i,
    galvalume: /galvalume/i,
    "fibre-cement": /fib(re|er)[\s-]*cement|asbestos|cement sheet/i,
    "puf-panel": /\bPUF\b|insulated/i,
    thatch: /thatch/i,
  },
  feedingSystem: {
    manual: /manual|bell drinker|round feeder/i,
    "semi-auto": /semi[\s-]*auto|nipple/i,
    automatic: /(?<!semi[\s-]*)\bautomatic\b|auto[\s-]*feed/i,
    trough: /trough/i,
  },
  state: Object.fromEntries(Object.keys(INDIA_LOCATIONS).map((state) => [state, new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")])),
};

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const numbersIn = (text) =>
  new Set(
    [...String(text).replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit))).replace(/(\d),(\d)/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map(
      (match) => Number(match[0])
    )
  );

// Sizes the question gives in another unit, as metres (or square metres): "10 km long" is a length of 10,000 m.
const SIZE_UNITS = [
  { pattern: /(\d+(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet)|square\s*(?:feet|foot))\b/gi, fields: ["areaSqm"], factor: 0.092903 },
  { pattern: /(\d+(?:\.\d+)?)\s*(?:km|kilomet(?:er|re)s?)\b/gi, fields: ["lengthM", "widthM"], factor: 1000 },
  { pattern: /(?<!sq\.?\s*|square\s*)(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\b/gi, fields: ["lengthM", "widthM"], factor: 0.3048 },
];
const nearly = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.01);

/** The size in metres a field's value stands for, when the question gives that size in another unit; else null. */
function sizeInOtherUnit(field, value, question) {
  const text = String(question).replace(/(\d),(\d)/g, "$1$2");
  for (const unit of SIZE_UNITS) {
    if (!unit.fields.includes(field)) continue;
    for (const match of text.matchAll(unit.pattern)) {
      const given = Number(match[1]);
      const metres = Math.round(given * unit.factor * 100) / 100;
      // The model converted the unit (10,000 for "10 km"), or copied the number without it (10).
      if (nearly(value, metres) || value === given) return metres;
    }
  }
  return null;
}

/**
 * Keeps only what the question really says: an option counts when the question names it (and is added when the
 * model missed the only option named for that field), a number counts when it appears in the question, and a size
 * given in km or feet counts in metres.
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
  for (const field of ["lengthM", "widthM", "areaSqm"]) {
    if (typeof grounded[field] !== "number") continue;
    const metres = sizeInOtherUnit(field, grounded[field], question);
    if (metres !== null) grounded[field] = metres;
    else if (!numbers.has(grounded[field])) grounded[field] = null;
  }
  for (const field of ["birds", ...ASSUMPTION_FIELDS]) {
    if (typeof grounded[field] === "number" && !numbers.has(grounded[field])) grounded[field] = null;
  }
  return grounded;
}

const round1 = (value) => Math.round(value * 10) / 10;
const CONFIG_FIELDS = ["birdType", "housingSystem", "farmingModel", "roofType", "roofSheet", "feedingSystem"];
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const isLayer = (birdType) => NORMS.birdTypes[birdType]?.product === "eggs";

/** The choices that follow from a new bird or shed type, so a single change still makes a valid shed. */
function keepCompatible(config) {
  const next = { ...config };
  if (next.birdType === "layer-cage" && !["trough", "automatic"].includes(next.feedingSystem)) next.feedingSystem = "trough";
  if (next.birdType !== "layer-cage" && next.feedingSystem === "trough") next.feedingSystem = "manual";
  if (isLayer(next.birdType)) next.farmingModel = "independent";
  if (next.housingSystem === "environment-controlled") next.sideWalls = "closed-tunnel";
  else if (next.sideWalls === "closed-tunnel") next.sideWalls = "mesh-curtain";
  if (next.housingSystem === "backyard") next.frameMaterial = "bamboo-wood";
  else {
    if (next.frameMaterial === "bamboo-wood") next.frameMaterial = "steel-truss";
    if (next.roofSheet === "thatch") next.roofSheet = "gi-sheet";
  }
  return next;
}

/**
 * The project's setup with the extracted changes applied, and a readable list of what changed.
 * @param {object} rawConfig  the setup as the client sent it (state or stateName)
 */
function applyChanges(rawConfig, extracted) {
  let config = { ...rawConfig };
  const changes = [];
  for (const field of CONFIG_FIELDS) {
    const next = extracted[field];
    if (next && next !== UNCHANGED && next !== rawConfig[field]) {
      changes.push({ field, from: rawConfig[field] ?? null, to: next });
      config[field] = next;
    }
  }
  const currentState = rawConfig.stateName ?? rawConfig.state ?? null;
  if (extracted.state && extracted.state !== UNCHANGED && extracted.state !== currentState) {
    changes.push({ field: "state", from: currentState, to: extracted.state });
    config.stateName = extracted.state;
    config.state = extracted.state;
    config.district = ""; // the old district is in the old state
  }
  config = keepCompatible(config);

  const length = Number(rawConfig.length);
  const width = Number(rawConfig.width);
  if (positive(extracted.birds) && width > 0) {
    // "5,000 birds" keeps the shed's width and lengthens it to hold them at its stocking density.
    const area = floorAreaFor({ birds: extracted.birds, birdType: config.birdType, housing: config.housingSystem, stockingDensity: config.stockingDensity });
    if (area) config.length = Math.ceil((area / width) * 2) / 2;
  } else if (positive(extracted.lengthM) || positive(extracted.widthM)) {
    config.length = positive(extracted.lengthM) ? extracted.lengthM : length;
    config.width = positive(extracted.widthM) ? extracted.widthM : width;
  } else if (positive(extracted.areaSqm) && length > 0 && width > 0) {
    const scale = Math.sqrt(extracted.areaSqm / (length * width));
    config.length = Math.round(length * scale * 2) / 2;
    config.width = Math.round(width * scale * 2) / 2;
  }
  if (Number(config.length) !== length || Number(config.width) !== width) {
    changes.push({ field: "size", from: `${length} x ${width} m`, to: `${config.length} x ${config.width} m` });
  }
  return { config, changes };
}

/** The figures the chat quotes for one setup, all from the poultry calculator. */
function figures(result) {
  const r = result.returns;
  return {
    birds: result.flock.birds,
    capitalCostInr: result.cost.capitalCost,
    financedCostInr: result.financedCost,
    subsidyInr: Math.round(r.subsidyAmount),
    netInvestmentInr: Math.round(r.netInvestment),
    annualProfitInr: Math.round(r.annualProfit),
    paybackYears: r.paybackYears !== null ? round1(r.paybackYears) : null,
    breakEvenPrice: r.breakEvenPrice !== null ? Math.round(r.breakEvenPrice * 100) / 100 : null,
    product: r.product,
  };
}

/**
 * Both sets of figures for a what-if: the project as it is, and with the changes. Null when the question is not
 * a what-if or changes nothing; { error } when the changed setup is not valid (the planner's own message).
 * @param {{ rawConfig: object, assumptions: object|null, extracted: object, question?: string, runCalculation: Function }} input
 */
function planScenario({ rawConfig, assumptions, extracted: modelReading, question, runCalculation }) {
  if (!modelReading || modelReading.isWhatIf !== true) return null;
  const extracted = question === undefined ? modelReading : groundExtraction(modelReading, question);
  const { config, changes } = applyChanges(rawConfig, extracted);

  const base = assumptions || {};
  // Another bird or farming model has its own production figures and prices: start from its defaults.
  const familyChanged = changes.some((change) => change.field === "birdType" || change.field === "farmingModel");
  const next = familyChanged ? { ...defaultAssumptions(config.birdType, config.farmingModel), subsidyInr: base.subsidyInr ?? 0 } : { ...base };
  for (const field of ASSUMPTION_FIELDS) {
    const value = extracted[field];
    // A value equal to today's is the model repeating the project, not a change.
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value !== base[field]) {
      changes.push({ field, from: base[field] ?? null, to: value });
      next[field] = value;
    }
  }
  if (changes.length === 0) return null;

  const baseline = runCalculation(rawConfig, assumptions || undefined);
  const scenario = runCalculation(config, next);
  if (baseline.errors) return null;
  if (scenario.errors) return { changes, error: Object.values(scenario.errors)[0] };
  const notes = [];
  if (familyChanged) notes.push("The bird or the farming model changes, so its production figures and prices start from the planner's defaults for it.");
  // The shed grows in half metres, so it holds a few more birds than asked; the model kept repeating the number asked.
  const birds = scenario.result.flock.birds;
  if (positive(extracted.birds) && birds !== extracted.birds) {
    notes.push(
      `${extracted.birds.toLocaleString("en-IN")} birds were asked for; the shed made for them (${config.length} x ${config.width} m) holds ${birds.toLocaleString("en-IN")}. Give both numbers.`
    );
  }
  return { changes, baseline: figures(baseline.result), scenario: figures(scenario.result), note: notes.join(" ") || null };
}

const inr = (value) => (value === null ? "not available" : `Rs ${Math.round(value).toLocaleString("en-IN")}`);
const years = (value) => (value === null ? "no payback" : `${value} years`);
const breakEven = (figure) =>
  figure.breakEvenPrice === null ? "not available" : `Rs ${figure.breakEvenPrice} ${figure.product === "eggs" ? "per egg" : "per kg"}`;

const figureLines = (figure) => [
  `Birds: ${figure.birds.toLocaleString("en-IN")}`,
  `Build cost: ${inr(figure.capitalCostInr)}`,
  `Cost financed (with the first batch): ${inr(figure.financedCostInr)}`,
  `Subsidy counted: ${inr(figure.subsidyInr)}`,
  `Net investment: ${inr(figure.netInvestmentInr)}`,
  `Yearly profit: ${inr(figure.annualProfitInr)}`,
  `Payback: ${years(figure.paybackYears)}`,
  `Break-even price: ${breakEven(figure)}`,
];

/**
 * The prompt block the model must quote from. The figures with the change come first and on their own: with both
 * values on one line, a small model copied the first one ("now") as the answer.
 */
function scenarioBlock(plan) {
  const changeText = plan.changes.map((change) => `${change.field}: ${change.from ?? "not set"} -> ${change.to}`).join("; ");
  if (plan.error) {
    return `PLANNER WHAT-IF: the planner cannot calculate this change (${changeText}): ${plan.error}. Say so and do not estimate figures.`;
  }
  return [
    `PLANNER WHAT-IF (calculated by the planner; quote these figures exactly and do not calculate your own). Change: ${changeText}.`,
    "Answer with the WITH THE CHANGE figures; mention the NOW figures only to compare.",
    "WITH THE CHANGE:",
    ...figureLines(plan.scenario),
    "NOW (the project as it is):",
    ...figureLines(plan.baseline),
    plan.note ? `Note: ${plan.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = { ASSUMPTION_FIELDS, EXTRACTION_SYSTEM, WHAT_IF_SCHEMA, applyChanges, groundExtraction, looksLikeWhatIf, planScenario, scenarioBlock };
