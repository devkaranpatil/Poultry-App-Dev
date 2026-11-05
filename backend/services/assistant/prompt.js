// What the assistant's model reads: its rules, the project's facts and the numbered sources.
const { APP_NAME } = require("../../config/app");
const { CPCB_THRESHOLD_BIRDS } = require("../../data/poultry/siting");

const LANGUAGES = { en: "English", hi: "Hindi", mr: "Marathi" };
const PASSAGE_CHARS = 650; // per retrieved passage in the prompt (every ~3.5 characters costs the model a token)

const round = (value) => (value === null || value === undefined ? null : Math.round(value));

/** Everything the model may quote about this project, all computed by the planner. */
function buildProjectFacts(config, result) {
  const r = result.returns;
  return {
    location: { state: config.stateName, district: config.district || null },
    shed: {
      lengthM: Number(config.length),
      widthM: Number(config.width),
      eavesHeightM: Number(config.eavesHeight),
      ridgeHeightM: Number(config.ridgeHeight),
      areaSqm: result.area,
      areaSqft: result.areaSqft,
      housing: config.housingSystem,
      roof: config.roofType,
      frame: config.frameMaterial,
      roofSheet: config.roofSheet,
      sideWalls: config.sideWalls,
      entry: config.entry,
      feeding: config.feedingSystem,
    },
    flock: {
      birdType: config.birdType,
      birds: result.flock.birds,
      sqftPerBird: result.flock.sqftPerBird,
      farmingModel: config.farmingModel,
    },
    climate: {
      zone: result.climate.climateZone,
      group: result.climate.climateGroup,
      hottestMonthMeanC: result.climate.hottestMonthMeanC ?? null,
      humidityPct: result.climate.humidity,
      annualRainfallMm: result.climate.rainfall,
      heatStressMonths: result.climate.heatStress?.severeMonths ?? [],
      advisories: result.climate.advisories,
    },
    // Each name says what the figure covers: with a short name ("project") the model quoted NABARD's unit cost as
    // the project's total.
    costInr: {
      buildAndEquipShed: result.cost.capitalCost,
      firstBatchWorkingCapital: result.cost.workingCapital.total,
      totalWithFirstBatch: result.cost.projectCost,
      financedByFarmer: result.financedCost,
      civilWorks: result.cost.civilCost,
      equipment: result.cost.equipmentCost,
      nabardUnitCostForThisFlock: result.nabard?.normCostInr ?? null,
    },
    // Every scheme checked, with its verdict; noneApplies means the bank loan carries the project.
    schemes: {
      noneApplies: result.schemes.noneApplies,
      list: result.schemes.schemes.map((scheme) => ({
        name: scheme.name,
        status: scheme.status,
        percent: scheme.percent,
        amountInr: scheme.amountInr,
        reasons: scheme.reasons,
      })),
    },
    // The rules that bind this farm, and the CPCB ones that do not: shown only the first, the model listed the CPCB
    // distances from the SOURCES for a 1,054-bird farm.
    siting: {
      rulesForThisFarm: result.siting.map((rule) => rule.description + (rule.distanceM ? ` (at least ${rule.distanceM} m)` : "")),
      notForThisFarm:
        result.flock.birds > CPCB_THRESHOLD_BIRDS
          ? null
          : `The CPCB siting distances and the pollution control consent apply only above ${CPCB_THRESHOLD_BIRDS.toLocaleString("en-IN")} birds, so not to this farm of ${result.flock.birds.toLocaleString("en-IN")}.`,
    },
    yearlyFigures: {
      batchesPerYear: Math.round(r.cyclesPerYear * 10) / 10,
      birdsSold: round(r.birdsSoldPerYear),
      kgSold: round(r.kgSoldPerYear),
      eggs: round(r.eggsPerYear),
      revenueInr: round(r.annualRevenue),
      runningCostInr: round(r.annualOperatingCost),
      profitInr: round(r.annualProfit),
      subsidyCountedInr: round(r.subsidyAmount),
      netInvestmentInr: round(r.netInvestment),
      paybackYears: r.paybackYears === null ? null : Math.round(r.paybackYears * 10) / 10,
      breakEvenPrice: r.breakEvenPrice === null ? null : Math.round(r.breakEvenPrice * 100) / 100,
      breakEvenUnit: r.product === "eggs" ? "Rs per egg" : config.farmingModel === "contract" ? "Rs per kg growing charge" : "Rs per kg live weight",
    },
    assumptions: result.assumptions,
  };
}

function systemInstruction(language) {
  return [
    `You are the ${APP_NAME} assistant: a poultry husbandry and agri-finance adviser for poultry farms (broilers, layers and improved desi birds) in India.`,
    "Rules:",
    "1. Answer from the PROJECT FACTS and the numbered SOURCES below. Cite a source by its number, like [2], right after the claim it supports. A general question (what a shed should be, how much space a broiler needs) is answered from the SOURCES first, and may then say how this project compares; a question about \"my\" shed, farm, flock or project is answered from the PROJECT FACTS.",
    "2. If the SOURCES do not contain the answer, say plainly that the knowledge base has no official source for it. Then give at most two sentences of general advice with no numbers, and never name varieties, brands, chemicals or products that are not in the SOURCES.",
    "3. Never invent subsidy amounts, eligibility rules, prices, temperatures, doses or production figures. Copy figures exactly as the facts or sources give them. If sources disagree, use the one marked CURRENT, not OLDER or SUPERSEDED, and say which you used. Subsidies come only from the schemes in the PROJECT FACTS with their status; when schemes.noneApplies is true, say plainly that no scheme applies and the bank loan carries the project. Never work out a subsidy as a share of the cost yourself.",
    "4. Money is in Indian rupees (₹); use lakh and crore where natural. For vaccines, medicines and disinfectants, give only the product and schedule written in the SOURCES and add that a veterinarian's advice must be followed.",
    "5. Every question about poultry, birds, sheds, feed, water, disease, biosecurity, weather, subsidies, loans, costs or markets is in scope, even for topics the SOURCES do not cover (then follow rule 2). Only questions with nothing to do with farming (geography, celebrities, coding, poems, etc.) are out of scope: do not answer those, not even briefly; say in one sentence that you can only help with poultry farm planning. Refuse any request to harm people or to mistreat animals.",
    `6. Write all user-facing text in ${language}.`,
  ].join("\n");
}

const CHAT_GUIDANCE =
  `You are chatting with the project owner inside the ${APP_NAME} planner. Keep the answer under 150 words, use short paragraphs or bullet points, and refer to their actual numbers. ` +
  "If the message is only a greeting or thanks, reply in one short friendly sentence and offer help, with no figures.";

/** Drops empty values (null, "", empty lists) so the facts take fewer tokens to read. */
function compact(value) {
  if (Array.isArray(value)) return value.map(compact).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      const kept = compact(inner);
      const empty = kept === null || kept === undefined || kept === "" || (Array.isArray(kept) && kept.length === 0) ||
        (typeof kept === "object" && !Array.isArray(kept) && Object.keys(kept).length === 0);
      if (!empty) out[key] = kept;
    }
    return out;
  }
  return value;
}

const factsBlock = (facts) => `PROJECT FACTS (JSON):\n${JSON.stringify(compact(facts))}`;

/** Instructions plus the project's facts: identical for every request about one project, so the model keeps it warm. */
const conversationSystem = (project) => [systemInstruction(project.language), "", factsBlock(project.facts)].join("\n");

/** The numbered passages the model may quote, each tagged with where it came from. */
function sourcesBlock(passages) {
  if (passages.length === 0) return "SOURCES: none were found for this question.";
  const entries = passages.map((passage) => {
    const flags = [passage.status === "older" ? "OLDER DOCUMENT" : "CURRENT", passage.scope !== "India" ? `${passage.scope} only` : null]
      .filter(Boolean)
      .join(", ");
    const note = passage.status === "older" && passage.note ? ` Note: ${passage.note}` : "";
    return `[${passage.n}] ${passage.title} (${flags}) - ${passage.publisher}.${note}\n${passage.text.slice(0, PASSAGE_CHARS)}`;
  });
  return `SOURCES (cite as [1], [2], ...):\n${entries.join("\n\n")}`;
}

/** What the browser needs to show where an answer came from. */
function clientSources(passages, citedNumbers) {
  const cited = passages.filter((passage) => citedNumbers.has(passage.n));
  const shown = cited.length > 0 ? cited : passages.slice(0, 2);
  return shown.map((passage) => ({
    n: passage.n,
    title: passage.title,
    publisher: passage.publisher,
    url: passage.url,
    section: passage.section || null,
    cited: cited.length > 0,
  }));
}

const citedNumbers = (text) => new Set([...text.matchAll(/\[(\d{1,2})\]/g)].map((match) => Number(match[1])));

module.exports = {
  LANGUAGES,
  PASSAGE_CHARS,
  CHAT_GUIDANCE,
  buildProjectFacts,
  compact,
  conversationSystem,
  sourcesBlock,
  clientSources,
  citedNumbers,
};
