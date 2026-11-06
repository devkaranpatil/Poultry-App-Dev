// Builds the assistant's knowledge base: every passage it may quote, with the source it came from.
//
//   1. Official documents (datasets/knowledge/manifest.json -> text/<id>.txt, built by fetch_knowledge.py):
//      NLM-EDP and AHIDF guidelines, NABARD and NCDC poultry projects, CPCB and DAHD rules, TNAU and Vikaspedia guides
//   2. The official tables in datasets/csv (NABARD unit costs, production norms, scheme rules, siting rules) and the
//      district climate
//   3. The planner's own norms, prices, schemes, siting rules and cost model (generated from the code and
//      shared/poultry-norms.json, so the explanation can never drift from what the calculator does)
//   4. The planner's documentation (docs/*.md)
//
// Nothing here is invented: each passage is a transcription of, or generated directly from, one of those sources.

const fs = require("fs");
const path = require("path");
const { APP_NAME } = require("../../config/app");
const { parseCsv } = require("../../scripts/loadReferenceData");
const NORMS = require("../../../shared/poultry-norms.json");
const { SCHEMES } = require("../../data/poultry/schemes");
const { CPCB_THRESHOLD_BIRDS, SITING_RULES } = require("../../data/poultry/siting");
const { SEVERE_THI, assessHeatStress } = require("../poultry/heatStress");
const { getClimateData } = require("../climate");
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

/* ------------------------------ 2. official tables ------------------------------ */

/** "nabard-unit-cost-2023" -> "NABARD Unit Cost 2023-24, ... (verified)", the way every planner passage names its source. */
function sourceName(id) {
  const source = NORMS.sources[id];
  if (!source) return id;
  if (id === "planner-assumption") return "the planner's own assumption, with no published source";
  return `${source.document || id}${source.verified ? "" : " (secondary source, not verified)"}`;
}

function unitCostDocument() {
  const rows = readCsv("nabard_poultry_unit_costs.csv");
  const doc = {
    id: "dataset-nabard-unit-costs",
    title: "NABARD poultry unit costs (transcribed table)",
    publisher: "NABARD regional unit costs, transcribed into this project's datasets",
    url: rows[0]?.source_url || null,
    priority: 1.1,
    kind: "dataset",
    tags: { topic: "cost-norm" },
  };
  return documentFromPassages(
    doc,
    rows.map((row) => ({
      section: `${row.state} ${row.year}: ${row.bird_type} ${row.birds} birds`,
      tags: { bird: row.bird_type, state: row.state },
      text:
        `NABARD unit cost (${row.state}, ${row.year}): ${row.bird_type}, ${row.system}, ` +
        (Number(row.birds) === 1
          ? `${inr(row.unit_cost_inr)} a bird (the booklet gives no unit size)`
          : `${Number(row.birds).toLocaleString("en-IN")} birds: ${inr(row.unit_cost_inr)} for the unit`) +
        (row.repayment_years ? `, repaid over ${row.repayment_years} years. ` : ". ") +
        `${row.notes ? `${row.notes}. ` : ""}Banks finance against the unit cost of their own state; other states publish different figures. Source: ${row.source_document}.`,
    }))
  );
}

function productionNormsDocument() {
  const rows = readCsv("poultry_production_norms.csv");
  const doc = {
    id: "dataset-production-norms",
    title: "Poultry production norms used by the planner (transcribed table)",
    publisher: "NABARD, NCDC and published studies, transcribed into this project's datasets",
    url: null,
    priority: 1.05,
    kind: "dataset",
    tags: { topic: "production" },
  };
  const part = (label, value, unit = "") => (value !== "" && value !== undefined ? `${label} ${value}${unit}` : null);
  return documentFromPassages(
    doc,
    rows.map((row) => ({
      section: `${row.bird_type}, ${row.housing}`,
      tags: { bird: row.bird_type },
      text:
        `Production norms for ${row.bird_type} in a ${row.housing} shed: ` +
        [
          part("floor space", row.sqft_per_bird, " sq ft per bird"),
          part("rearing", row.rearing_days, " days"),
          part("cleaning between batches", row.cleaning_days, " days"),
          part("mortality", row.mortality_pct, " percent"),
          part("sale weight", row.sale_weight_kg, " kg"),
          part("feed", row.feed_kg_per_bird, " kg per bird"),
          part("grower period", row.grower_weeks, " weeks"),
          part("laying period", row.laying_weeks, " weeks"),
          part("eggs per hen", row.eggs_per_hen),
          part("laying mortality", row.laying_mortality_pct, " percent"),
          part("feed conversion ratio", row.fcr),
        ]
          .filter(Boolean)
          .join(", ") +
        `. Sources: ${String(row.source_ids).split(";").map(sourceName).join("; ")}.`,
    }))
  );
}

function schemeRulesDocument() {
  const rows = readCsv("poultry_scheme_rules.csv");
  const doc = {
    id: "dataset-scheme-rules",
    title: "Government schemes for poultry: the rules the planner checks",
    publisher: "DAHD scheme guidelines and state notifications, transcribed into this project's datasets",
    url: null,
    priority: 1.15,
    kind: "dataset",
    tags: { topic: "subsidy-rule" },
  };
  const passages = rows.map((row) => {
    const verified = String(row.verified).toLowerCase() === "true";
    return {
      section: row.scheme,
      ...(row.state ? { tags: { state: row.state } } : {}),
      status: verified ? "current" : "unverified",
      note: verified ? undefined : "Not confirmed from the official notification; check with the state animal husbandry department.",
      text:
        `${verified ? "" : "UNVERIFIED. "}${row.scheme}${row.state ? ` (${row.state})` : " (central scheme)"}: for ${row.unit}. ` +
        (row.percent_general ? `Subsidy ${row.percent_general} percent for general and ${row.percent_sc_st || row.percent_general} percent for SC/ST beneficiaries. ` : "") +
        (row.cap_inr ? `Capped at ${inr(row.cap_inr)}. ` : "") +
        (row.min_own_contribution_pct ? `The beneficiary puts in at least ${row.min_own_contribution_pct} percent. ` : "") +
        (row.min_parent_females ? `At least ${row.min_parent_females} parent females and ${row.min_parent_males} males. ` : "") +
        (String(row.greenfield_only).toLowerCase() === "true" ? "New (greenfield) projects only. " : "") +
        `${row.notes || ""} Source: ${row.source_document}.`,
    };
  });
  passages.push({
    section: "Subsidy overview",
    text:
      "Government help for a poultry farm in India: there is no central capital subsidy for a plain commercial broiler or layer farm. " +
      "The National Livestock Mission (NLM-EDP) gives a 50 percent back-ended capital subsidy, up to Rs 25 lakh, only for a rural poultry parent farm with a hatchery and brooder-mother unit. " +
      "AHIDF gives a 3 percent interest subvention, but for feed plants and meat processing, not the farm itself. " +
      "Some states run their own schemes. A broiler or layer farm is usually financed by a bank loan against NABARD's unit cost. " +
      "The planner's scheme check (PROJECT FACTS) says which of these apply to the farmer's project.",
  });
  return documentFromPassages(doc, passages);
}

function sitingDocument() {
  const rows = readCsv("poultry_siting_rules.csv");
  const doc = {
    id: "dataset-siting-rules",
    title: "Siting and consent rules for poultry farms (CPCB guidelines)",
    publisher: "Central Pollution Control Board, transcribed into this project's datasets",
    url: rows[0]?.source_url || null,
    priority: 1.1,
    kind: "dataset",
    tags: { topic: "siting" },
  };
  return documentFromPassages(doc, [
    {
      section: "Consent",
      text:
        `Farms with more than ${CPCB_THRESHOLD_BIRDS.toLocaleString("en-IN")} birds need consent to establish and to operate from the State Pollution Control Board under the Air and Water Acts, ` +
        "under the CPCB Environmental Guidelines for Poultry Farms enforced by NGT orders. The siting distances below apply to these farms.",
    },
    ...rows.map((row) => ({
      section: row.rule_id,
      text:
        `${row.description}${row.distance_m ? `: at least ${row.distance_m} m` : ""}` +
        `${row.applies_above_birds ? `, for farms above ${Number(row.applies_above_birds).toLocaleString("en-IN")} birds` : ""}` +
        `${row.applies_to ? ` (${row.applies_to})` : ""}. Source: ${row.source_document}.`,
    })),
  ]);
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
    const heat = assessHeatStress({ stateName: state, district, product: "meat", housingSystem: "open-sided" });
    const severe = heat ? heat.severeMonths : [];
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
        `In the planner this district is in the "${used.group}" climate group (${used.zone}), with ${fmt(used.rainfall, 0)} mm of rain a year (${used.rainfallSource} value). ` +
        (severe.length > 0
          ? `Broilers in an open shed face severe heat stress (temperature-humidity index above ${SEVERE_THI}) in ${severe.join(", ")}.`
          : `No month reaches severe heat stress for broilers (temperature-humidity index above ${SEVERE_THI}) on monthly averages, though afternoons can still be hot.`),
    });
  }
  return documentFromPassages(doc, passages);
}

/* ------------------------------ 3. the planner's own data ------------------------------ */

const fromValue = (entry) => {
  if (!entry || typeof entry !== "object") return String(entry);
  if (entry.value !== undefined) return String(entry.value);
  if (entry.low !== undefined) return `${entry.low} to ${entry.high}`;
  return "";
};
const label = (key) => key.replace(/([A-Z])/g, " $1").replace(/Inr/g, " (Rs)").replace(/\s+/g, " ").trim().toLowerCase();

function birdDocument() {
  const doc = {
    id: "planner-birds",
    title: "Birds in the planner",
    publisher: `${APP_NAME} bird norms (shared/poultry-norms.json)`,
    url: null,
    priority: 0.95,
    kind: "planner",
    tags: { topic: "birds" },
  };
  const passages = Object.entries(NORMS.birdTypes).map(([key, bird]) => {
    const facts = Object.entries(bird)
      .filter(([name, value]) => !["label", "product", "housing", "sources", "sqftPerBird", "sqftPerBirdSources"].includes(name) && typeof value !== "object")
      .map(([name, value]) => `${label(name)} ${value}${bird.sources?.[name] ? ` (${sourceName(bird.sources[name])})` : ""}`);
    const space = Object.entries(bird.sqftPerBird || {}).map(
      ([housing, value]) => `${value} sq ft per bird in ${/^[aeiou]/.test(housing) ? "an" : "a"} ${housing} shed (${sourceName(bird.sqftPerBirdSources?.[housing])})`
    );
    return {
      section: bird.label,
      tags: { bird: key },
      text:
        `${bird.label} (${key}) in the planner, kept for ${bird.product}, in ${bird.housing.join(" or ")} sheds. ` +
        `Floor space: ${space.join("; ")}. ${facts.join("; ")}.`,
    };
  });
  passages.push({
    section: "Shed types",
    text:
      "Shed types in the planner: " +
      Object.entries(NORMS.housingSystems)
        .map(([key, housing]) => `${housing.label} (${key})`)
        .join("; ") +
      ". An environment-controlled shed has closed walls with tunnel fans and cooling pads; an open-sided shed has a low wall, wire mesh and curtains.",
  });
  return documentFromPassages(doc, passages);
}

function costModelDocument() {
  const doc = {
    id: "planner-cost-model",
    title: "How the planner prices a poultry shed and its running costs",
    publisher: `${APP_NAME} cost model (backend/services/poultry/costModel.js, shared/poultry-norms.json)`,
    url: null,
    priority: 1.08,
    kind: "planner",
    tags: { topic: "cost-model" },
  };
  const isObject = (entry) => entry !== null && typeof entry === "object";
  // One cost item: "shed (rs) per sqft: broiler 319 (NABARD ...)". An item with its own source and several numbers
  // ({ sqft: 100, inrPerSqft: 275, source }) lists the numbers; a group ({ broiler: {...}, layer: {...} }) lists its members.
  const describe = (key, entry) => {
    if (!isObject(entry)) return `${label(key)} ${entry}`;
    const note = entry.note ? ` (${entry.note})` : "";
    const source = entry.source ? `, ${sourceName(entry.source)}` : "";
    if (entry.value !== undefined || entry.low !== undefined) return `${label(key)} ${fromValue(entry)}${note}${source}`;
    if (entry.source) {
      const numbers = Object.entries(entry)
        .filter(([name]) => !["source", "note"].includes(name))
        .map(([name, value]) => `${label(name)} ${isObject(value) ? fromValue(value) : value}`);
      return `${label(key)}: ${numbers.join(", ")}${note}${source}`;
    }
    return `${label(key)}: ${Object.entries(entry).map(([name, value]) => describe(name, value)).join("; ")}`;
  };
  const { workingCapital, ...capital } = NORMS.costs;
  // One passage per cost item, so a question about one rate finds that rate and not a page of all of them.
  const passages = Object.entries(capital).map(([key, entry]) => ({
    section: label(key),
    text: `A cost item the planner uses to build and equip a shed (rupees): ${describe(key, entry)}.`,
  }));
  if (workingCapital) {
    for (const [key, entry] of Object.entries(workingCapital)) {
      passages.push({ section: `Working capital: ${key}`, text: `Working capital for the first batch or flock (${key} birds): ${describe(key, entry)}.` });
    }
  }
  for (const [key, entries] of Object.entries(NORMS.prices)) {
    const list = Array.isArray(entries) ? entries : [entries];
    passages.push({
      section: label(key),
      tags: { topic: "price" },
      text:
        `Prices for ${label(key)} known to the planner: ` +
        list
          .map((entry) => `${entry.bird ? `${entry.bird}: ` : ""}${fromValue(entry)}${entry.note ? ` (${entry.note})` : ""} from ${sourceName(entry.source)}`)
          .join("; ") +
        ". Market prices change daily; the farmer can set their own in the planner's assumptions.",
    });
  }
  return documentFromPassages(doc, passages);
}

function plannerSchemesDocument() {
  const doc = {
    id: "planner-schemes",
    title: "How the planner checks government schemes",
    publisher: `${APP_NAME} scheme rules (backend/data/poultry/schemes.js)`,
    url: null,
    priority: 1.05,
    kind: "planner",
    tags: { topic: "subsidy-rule" },
  };
  return documentFromPassages(
    doc,
    Object.values(SCHEMES).map((scheme) => ({
      section: scheme.name,
      status: scheme.verified ? "current" : "unverified",
      text:
        `${scheme.verified ? "" : "UNVERIFIED. "}${scheme.name}${scheme.state ? ` (${scheme.state})` : ""}: ` +
        (scheme.percent ? `subsidy ${scheme.percent.general} percent (general), ${scheme.percent["sc-st"]} percent (SC/ST)` : "no capital subsidy") +
        (scheme.capInr ? `, capped at ${inr(scheme.capInr)}` : "") +
        (scheme.interestSubventionPct ? `; ${scheme.interestSubventionPct} percent interest subvention` : "") +
        `. ${(scheme.notes || []).join(" ")} Source: ${scheme.source?.document || "not stated"}.`,
    }))
  );
}

function plannerSitingDocument() {
  const doc = {
    id: "planner-siting",
    title: "Siting rules the planner asks the farmer to confirm",
    publisher: `${APP_NAME} siting checklist (backend/data/poultry/siting.js)`,
    url: null,
    priority: 0.95,
    kind: "planner",
    tags: { topic: "siting" },
  };
  return documentFromPassages(doc, [
    {
      section: "Siting checklist",
      text:
        "The planner's siting checklist: " +
        SITING_RULES.map(
          (rule) => `${rule.description}${rule.distanceM ? ` at least ${rule.distanceM} m` : ""}${rule.appliesAboveBirds ? ` (above ${rule.appliesAboveBirds.toLocaleString("en-IN")} birds)` : ""}`
        ).join("; ") +
        ". The farmer ticks each rule on the Site step; the report warns about the ones left unticked.",
    },
  ]);
}

function plannerDocs() {
  const files = [
    { file: "backend-architecture.md", title: "Planner documentation: backend architecture, cost model and audit", priority: 1.0 },
    { file: "3d-scene.md", title: "Planner documentation: the 3D shed", priority: 0.7 },
    { file: "3d-model-references.md", title: "Planner documentation: what Indian poultry sheds look like", priority: 0.75 },
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
    unitCostDocument(),
    productionNormsDocument(),
    schemeRulesDocument(),
    sitingDocument(),
    climateDocument(),
    birdDocument(),
    costModelDocument(),
    plannerSchemesDocument(),
    plannerSitingDocument(),
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
