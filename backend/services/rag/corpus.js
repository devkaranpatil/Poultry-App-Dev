// Builds the assistant's knowledge base: every passage it may quote, with the source it came from.
//
//   1. Official documents (datasets/knowledge/manifest.json -> text/<id>.txt, built by fetch_knowledge.py)
//   2. The official datasets in datasets/csv (cost norms, area limits, published yields, district climate)
//   3. The planner's own crop library, irrigation profiles and pricing constants (generated from the code,
//      so the explanation can never drift from what the calculator does)
//   4. The planner's documentation (docs/*.md)
//
// Nothing here is invented: each passage is a transcription of, or generated directly from, one of those sources.

const fs = require("fs");
const path = require("path");
const { APP_NAME } = require("../../config/app");
const { parseCsv } = require("../../scripts/loadReferenceData");
const pricing = require("../../data/pricing");
const { CROP_LIBRARY, CROPS_BY_CLIMATE_GROUP, IRRIGATION_PROFILES, PUBLISHED_YIELDS } = require("../../data/cultivation");
const { getClimateData } = require("../costModel");
const { chunkText, fixDegreeSigns } = require("./text");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const KNOWLEDGE_DIR = path.join(REPO_ROOT, "datasets/knowledge");
const CSV_DIR = path.join(REPO_ROOT, "datasets/csv");
const DOCS_DIR = path.join(REPO_ROOT, "docs");

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const readText = (file) => fs.readFileSync(file, "utf8");
const readCsv = (file) => parseCsv(readText(path.join(CSV_DIR, file)));
const fmt = (value, digits = 1) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits).replace(/\.0+$/, "") : "n/a");
const inr = (value) => `Rs ${Number(value).toLocaleString("en-IN")}`;

/** Wraps one passage with the metadata every passage carries. A passage can override its document's status. */
function makeChunk(doc, index, { text, section = "", tags = {}, status, note }) {
  return {
    id: `${doc.id}#${index + 1}`,
    docId: doc.id,
    title: doc.title,
    publisher: doc.publisher,
    url: doc.url || null,
    status: status || doc.status || "current",
    scope: doc.scope || "India",
    note: note || doc.note || null,
    priority: doc.priority ?? 1,
    kind: doc.kind || "document",
    section,
    text: text.trim(),
    tags: { ...(doc.tags || {}), ...tags },
  };
}

/** A document made of hand-built passages (one string or { text, section, tags } each). */
function documentFromPassages(doc, passages) {
  return {
    doc,
    chunks: passages.map((passage, index) =>
      makeChunk(doc, index, typeof passage === "string" ? { text: passage } : passage)
    ),
  };
}

/* ------------------------------ 1. official documents ------------------------------ */

function officialDocuments() {
  const manifestPath = path.join(KNOWLEDGE_DIR, "manifest.json");
  const missing = [];
  const documents = [];
  let manifest = { sources: [], gaps: [] };
  try {
    manifest = JSON.parse(readText(manifestPath));
  } catch {
    return { documents, missing, gaps: [] };
  }
  for (const source of manifest.sources) {
    const textFile = path.join(KNOWLEDGE_DIR, "text", `${source.id}.txt`);
    if (!fs.existsSync(textFile)) {
      missing.push(source.id);
      continue;
    }
    let text = readText(textFile);
    if (source.fixDegreeSigns) text = fixDegreeSigns(text);
    const doc = { ...source, kind: "document" };
    documents.push({ doc, chunks: chunkText(text).map((piece, index) => makeChunk(doc, index, piece)) });
  }
  return { documents, missing, gaps: manifest.gaps || [] };
}

/* ------------------------------ 2. official datasets ------------------------------ */

function costNormDocument() {
  const rows = readCsv("nhb_midh_protected_cultivation_cost_norms.csv");
  const doc = {
    id: "dataset-cost-norms",
    title: "NHB/MIDH protected cultivation cost norms (transcribed table)",
    publisher: "National Horticulture Board / MIDH, transcribed into this project's datasets",
    url: rows[0]?.source_url || null,
    priority: 1.12,
    kind: "dataset",
    tags: { topic: "cost-norm" },
  };
  return documentFromPassages(
    doc,
    rows.map((row) => ({
      section: row.component,
      text:
        `${row.scheme}, ${row.component}: ${row.structure_type}. Cost norm ${inr(row.cost_norm_inr)} ${row.unit}` +
        (row.cost_norm_hilly_inr ? ` (${inr(row.cost_norm_hilly_inr)} for hilly areas)` : "") +
        `. Pattern of assistance: ${row.pattern_of_assistance_verbatim || "not stated"}. ` +
        `Source: ${row.source_document}.${row.notes ? ` Note: ${row.notes}` : ""}`,
    }))
  );
}

function areaLimitDocument() {
  const rows = readCsv("midh_protected_cultivation_area_limits.csv");
  const doc = {
    id: "dataset-area-limits",
    title: "MIDH protected cultivation area limits per beneficiary",
    publisher: "Ministry of Agriculture & Farmers Welfare, Horticulture Division (letter File No. M-1401 1/5/2024-MIDH)",
    url: rows[0]?.source_url || null,
    priority: 1.15,
    kind: "dataset",
    tags: { topic: "subsidy-rule" },
  };
  return documentFromPassages(
    doc,
    rows.map((row) => {
      const superseded = /superseded/i.test(row.rule);
      return {
        section: row.scheme,
        status: superseded ? "older" : "current",
        note: superseded ? "This rule was replaced by the MoA&FW letter of 2025-08-12 and is no longer in force." : undefined,
        text:
          `${superseded ? "SUPERSEDED, no longer in force. " : "CURRENT RULE. "}${row.scheme}: ${row.rule} is ${row.value} ${row.unit}, effective from ${row.effective_from}. ` +
          `${row.notes || ""} Source: ${row.source_document}.`,
      };
    })
  );
}

/** One plain-language passage on government assistance, assembled from the two official tables above. */
function subsidySummaryDocument() {
  const norms = readCsv("nhb_midh_protected_cultivation_cost_norms.csv");
  const limits = readCsv("midh_protected_cultivation_area_limits.csv").filter((row) => !/superseded/i.test(row.rule));
  const doc = {
    id: "dataset-subsidy-summary",
    title: "Government subsidy for protected cultivation: overview from the official tables",
    publisher: "National Horticulture Board / MIDH and the MoA&FW letter of 2025-08-12, summarised for this project",
    url: norms[0]?.source_url || null,
    priority: 1.2,
    kind: "dataset",
    tags: { topic: "subsidy-rule" },
  };

  // Group the structures by the assistance they get, so the overview reads "X percent applies to A, B and C".
  const byPattern = new Map();
  for (const row of norms) {
    if (!row.pattern_of_assistance_verbatim) continue;
    const key = row.pattern_of_assistance_verbatim.trim();
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key).push(row.structure_type);
  }
  const patterns = [...byPattern.entries()]
    .map(([pattern, structures]) => `"${pattern}" for ${structures.slice(0, 6).join(", ")}${structures.length > 6 ? " and others" : ""}`)
    .join("; ");
  const rules = limits
    .map((row) => `${row.scheme}: ${row.rule} is ${row.value} ${row.unit} (from ${row.effective_from})`)
    .join("; ");
  const project = norms.find((row) => /project cost norm/i.test(row.structure_type));

  return documentFromPassages(doc, [
    {
      section: "Subsidy and assistance overview",
      text:
        "Government subsidy (pattern of assistance) for protected cultivation such as polyhouses, greenhouses and shade-net houses under the National Horticulture Board and MIDH. " +
        `The official table gives the assistance for each structure: ${patterns}. ` +
        (project ? `For a whole project the table states: ${project.pattern_of_assistance_verbatim || project.notes}. ` : "") +
        `Area rules in force: ${rules}. ` +
        (limits.length > 0
          ? "The wording \"above 2500 Sq.m\" in the cost-norm table predates the letter of 2025-08-12; the area thresholds above replace it. "
          : "") +
        "Subsidy is credit linked and back-ended. Small projects go to the state horticulture mission, whose rates can differ by state; confirm the current rates with the state horticulture department.",
    },
  ]);
}

function yieldDocument() {
  const rows = readCsv("crop_yields_published.csv");
  const doc = {
    id: "dataset-published-yields",
    title: "Published polyhouse crop yields",
    publisher: "Indian Journal of Horticulture and Indian Farming (transcribed into this project's datasets)",
    url: null,
    priority: 1.05,
    kind: "dataset",
    tags: { topic: "yield" },
  };
  return documentFromPassages(
    doc,
    rows.map((row) => ({
      section: row.crop,
      tags: { crop: row.crop.toLowerCase() },
      text:
        `${row.crop} yield ${row.yield_low} to ${row.yield_high} ${row.unit} (${row.period}), ${row.measure}. ` +
        `Setting: ${row.structure_and_location}. ${row.used_by_app === "yes" ? "The planner shows this figure." : "Not used by the planner."} ` +
        `Source: ${row.source_document}.${row.notes ? ` ${row.notes}` : ""}`,
    }))
  );
}

function climateDocument() {
  const rows = readCsv("district_climate_monthly.csv");
  const byDistrict = new Map();
  for (const row of rows) {
    const key = `${row.state}|${row.district}`;
    if (!byDistrict.has(key)) byDistrict.set(key, { state: row.state, district: row.district, elevation: row.elevation_m, months: {} });
    byDistrict.get(key).months[row.month] = row;
  }
  const doc = {
    id: "dataset-district-climate",
    title: "District climate (NASA POWER monthly climatology 2001-2025)",
    publisher: "NASA POWER (agroclimatology community), summarised for this project",
    url: "https://power.larc.nasa.gov",
    priority: 0.9,
    kind: "dataset",
    tags: { topic: "climate" },
  };

  const passages = [];
  for (const { state, district, elevation, months } of byDistrict.values()) {
    const annual = months.ANN;
    const monthly = MONTHS.map((name) => months[name]).filter(Boolean);
    if (!annual || monthly.length < 12) continue;
    const hottest = monthly.reduce((a, b) => (Number(b.t2m_mean_c) > Number(a.t2m_mean_c) ? b : a));
    const coldest = monthly.reduce((a, b) => (Number(b.t2m_mean_c) < Number(a.t2m_mean_c) ? b : a));
    const rainfallMm = Number(annual.precip_mm_per_day) * 365;
    const used = getClimateData(state, district);
    const heavyRain = used.rainfall > pricing.CLIMATE_SURCHARGE.heavyRainfallMm;
    const hot = typeof used.hottestMonthMeanC === "number" && used.hottestMonthMeanC >= pricing.CLIMATE_SURCHARGE.hotMonthMeanC;
    passages.push({
      section: `${district}, ${state}`,
      tags: { state, district },
      text:
        `Climate of ${district} district, ${state} (NASA POWER 2001-2025 climatology at the geocoded point, elevation ${fmt(elevation, 0)} m). ` +
        `Annual mean temperature ${fmt(annual.t2m_mean_c)} C. Hottest month ${hottest.month} (mean ${fmt(hottest.t2m_mean_c)} C); coldest month ${coldest.month} (mean ${fmt(coldest.t2m_mean_c)} C). ` +
        `Relative humidity ${fmt(annual.rh2m_pct, 0)} percent. Rainfall about ${fmt(rainfallMm, 0)} mm per year in NASA's gridded data, which can under-read in steep hill terrain. ` +
        `Solar radiation ${fmt(annual.solar_mj_m2_per_day)} MJ/m2/day. Wind ${fmt(annual.wind_2m_m_per_s)} m/s at 2 m. ` +
        `Monthly mean temperature (C): ${monthly.map((m) => `${m.month} ${fmt(m.t2m_mean_c)}`).join(", ")}. ` +
        `Monthly rainfall (mm/day): ${monthly.map((m) => `${m.month} ${fmt(m.precip_mm_per_day, 1)}`).join(", ")}. ` +
        `In the planner this district is in the "${used.group}" climate group (${used.zone}); it prices rainfall at ${fmt(used.rainfall, 0)} mm (${used.rainfallSource} value), ` +
        `so the heavy-rain surcharge ${heavyRain ? "applies" : "does not apply"}, and the heat surcharge ${hot ? "applies" : "does not apply"}.`,
    });
  }
  return documentFromPassages(doc, passages);
}

/* ------------------------------ 3. the planner's own data ------------------------------ */

function cropDocument() {
  const doc = {
    id: "planner-crops",
    title: "Crops in the planner",
    publisher: `${APP_NAME} crop library (suitability ratings and seasons are the planner's own judgement)`,
    url: null,
    priority: 0.95,
    kind: "planner",
    tags: { topic: "crop" },
  };
  const passages = [];
  for (const [key, crop] of Object.entries(CROP_LIBRARY)) {
    const published = PUBLISHED_YIELDS[crop.name];
    passages.push({
      section: crop.name,
      tags: { crop: key },
      text:
        `${crop.name} in the planner: expected yield ${crop.expectedYield}; season ${crop.season}. ${crop.notes} ` +
        `Suitability by climate group: ${Object.entries(crop.suitabilityByZone).map(([group, rating]) => `${group} ${rating}`).join(", ")}. ` +
        (published
          ? `The yield comes from published trials: ${published.basis}. Source: ${published.source}. ${published.note}`
          : "This yield is the planner's own unverified estimate; no published trial in the datasets supports it."),
    });
  }
  for (const [group, rows] of Object.entries(CROPS_BY_CLIMATE_GROUP)) {
    passages.push({
      section: `Suggested crops for ${group} climates`,
      text:
        `Crops the planner suggests for the ${group} climate group, best first: ` +
        rows.map(([name, rating, yieldText, season, notes]) => `${name} (${rating}; ${yieldText}; ${season}; ${notes})`).join(" "),
    });
  }
  for (const [key, profile] of Object.entries(IRRIGATION_PROFILES)) {
    passages.push({
      section: profile.label,
      tags: { irrigation: key },
      text:
        `${profile.label} irrigation in the planner costs ${inr(pricing.IRRIGATION_RATE_PER_SQM[key])} per m2 of floor area. ${profile.notes.join(" ")} ` +
        "This irrigation rate is an unsourced assumption: no public price dataset exists for it.",
    });
  }
  return documentFromPassages(doc, passages);
}

function pricingDocument() {
  const doc = {
    id: "planner-cost-model",
    title: "How the planner prices a structure",
    publisher: `${APP_NAME} cost model (backend/data/pricing.js)`,
    url: null,
    priority: 1.08,
    kind: "planner",
    tags: { topic: "cost-model" },
  };
  const list = (rates) => Object.entries(rates).map(([name, rate]) => `${name.replace(/_/g, " ")} ${rate}`).join(", ");
  const unsourced = [...pricing.UNSOURCED_MATERIALS.structureMaterial, ...pricing.UNSOURCED_MATERIALS.coverMaterial].join(" and ");
  return documentFromPassages(doc, [
    {
      section: "Rates",
      text:
        "The planner's rates, in rupees per square metre of FLOOR area: " +
        `structure: ${list(pricing.STRUCTURE_RATE_PER_SQM)}. Cover: ${list(pricing.COVER_RATE_PER_SQM)}. ` +
        `Side ventilation: ${list(pricing.VENTILATION_RATE_PER_SQM)}. Irrigation: ${list(pricing.IRRIGATION_RATE_PER_SQM)}. ` +
        `Foundation ${pricing.FOUNDATION_RATE_PER_SQM}. Miscellaneous ${pricing.MISC_RATE_PER_SQM}. ` +
        `Labour is ${pricing.LABOR_RATIO * 100} percent of structure plus cover plus foundation. ` +
        `Climate-controlled (fan and pad) houses add ${pricing.CLIMATE_CONTROL_RATE_PER_SQM} per m2 for cooling and controls. ` +
        `The rates for ${unsourced} have no official source; they are the planner's assumptions and the result screen warns about them.`,
    },
    {
      section: "Climate surcharge and estimate band",
      text:
        `The total is multiplied by a climate factor: plus ${pricing.CLIMATE_SURCHARGE.heavyRainfall * 100} percent when the rainfall used is above ${pricing.CLIMATE_SURCHARGE.heavyRainfallMm} mm a year, ` +
        `and plus ${pricing.CLIMATE_SURCHARGE.hotTemp * 100} percent when the district's hottest month averages ${pricing.CLIMATE_SURCHARGE.hotMonthMeanC} C or more. ` +
        "The 35 C threshold and the percentages are the planner's own choices, not from any official source. The quoted range is the total plus or minus 10 percent.",
    },
    {
      section: "Reference design and shade-net houses",
      text:
        `Structure and cover quantities scale with the real outer surface (walls, gable ends and roof) compared with the NHB reference house: ` +
        `gutter height ${pricing.REFERENCE_DESIGN.gutterHeight} m, ridge height ${pricing.REFERENCE_DESIGN.ridgeHeight} m, ${pricing.REFERENCE_DESIGN.roofType} roof (NHB Technical Standard NHB-PH-Type 02-2011). ` +
        "A taller house or a different roof therefore costs more or less than the reference. " +
        `A shade-net house is lighter than a covered house, so its structure rate is multiplied by the official norm ratio: ` +
        `${Object.entries(pricing.SHADE_NET_STRUCTURE_FACTOR).map(([name, factor]) => `${name.replace(/_/g, " ")} ${factor.toFixed(2)}`).join(", ")}. ` +
        "The door type and the selected crop do not change the price: the official norms have no door rate, and a crop affects revenue, not build cost.",
    },
    {
      section: "Official benchmark",
      text:
        `The planner's structure plus cover rate for a naturally ventilated steel house is ${pricing.STRUCTURE_RATE_PER_SQM.galvanized_iron + pricing.COVER_RATE_PER_SQM.uv_polyfilm} per m2, ` +
        `about 15 percent above the official NHB norm of ${pricing.OFFICIAL_NORM_PER_SQM.naturallyVentilatedTubular} per m2; for bamboo it is about 16 percent above ${pricing.OFFICIAL_NORM_PER_SQM.naturallyVentilatedBamboo}. ` +
        "The official norms are used as a sanity check and to derive ratios, not as prices.",
    },
  ]);
}

function plannerDocs() {
  const files = [
    { file: "backend-architecture.md", title: "Planner documentation: backend architecture, cost model and audit", priority: 1.0 },
    { file: "3d-scene.md", title: "Planner documentation: the 3D scene", priority: 0.7 },
  ];
  return files
    .filter(({ file }) => fs.existsSync(path.join(DOCS_DIR, file)))
    .map(({ file, title, priority }) => {
      const doc = { id: `planner-doc-${file.replace(/\.md$/, "")}`, title, publisher: `${APP_NAME} documentation`, url: null, priority, kind: "planner" };
      return { doc, chunks: chunkText(readText(path.join(DOCS_DIR, file)), { maxWords: 200 }).map((piece, index) => makeChunk(doc, index, piece)) };
    });
}

function gapsDocument(gaps) {
  if (!gaps.length) return [];
  const doc = {
    id: "knowledge-gaps",
    title: "What the knowledge base does not cover",
    publisher: `${APP_NAME} knowledge base`,
    url: null,
    priority: 1.0,
    kind: "planner",
  };
  return [
    documentFromPassages(doc, [
      { section: "Known gaps", text: `Known gaps in the assistant's official sources: ${gaps.join(" ")} When asked about these, say there is no official source in the knowledge base.` },
    ]),
  ];
}

/* ------------------------------ assemble ------------------------------ */

/**
 * @returns {{ chunks: object[], documents: Array<{id:string,title:string,chunks:number}>, missing: string[] }}
 */
function buildCorpus() {
  const official = officialDocuments();
  const built = [
    ...official.documents,
    costNormDocument(),
    areaLimitDocument(),
    subsidySummaryDocument(),
    yieldDocument(),
    climateDocument(),
    cropDocument(),
    pricingDocument(),
    ...plannerDocs(),
    ...gapsDocument(official.gaps),
  ];
  const chunks = built.flatMap((entry) => entry.chunks);
  return {
    chunks,
    documents: built.map(({ doc, chunks: list }) => ({ id: doc.id, title: doc.title, chunks: list.length })),
    missing: official.missing,
  };
}

module.exports = { buildCorpus, makeChunk };
