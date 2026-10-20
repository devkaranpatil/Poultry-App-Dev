// Loads the official reference datasets (datasets/csv) into Postgres. Idempotent: each table is
// emptied and refilled, so re-running after regenerating a CSV just refreshes it.
//
//   node backend/scripts/loadReferenceData.js          (uses DATABASE_URL from backend/.env)
//   node backend/scripts/loadReferenceData.js poultry  (only the poultry_* tables)
//
// The database is shared with the polyhouse planner, so load "poultry" there: the polyhouse tables are
// that app's, and this repository's copies of their CSVs may drift from it over time.

const fs = require("fs");
const path = require("path");

const CSV_DIR = path.resolve(__dirname, "../../datasets/csv");

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
}

const num = (value) => (value === "" ? null : Number(value));
const text = (value) => (value === "" ? null : value);
const bool = (value) => value === "true";

// table -> { file, columns: [column, converter] }
const TABLES = [
  {
    table: "cost_norms",
    file: "nhb_midh_protected_cultivation_cost_norms.csv",
    columns: [
      ["scheme", (r) => r.scheme],
      ["component", (r) => r.component],
      ["structure_type", (r) => r.structure_type],
      ["cost_norm_inr", (r) => num(r.cost_norm_inr)],
      ["unit", (r) => r.unit],
      ["cost_norm_hilly_inr", (r) => num(r.cost_norm_hilly_inr)],
      ["pattern_of_assistance_verbatim", (r) => text(r.pattern_of_assistance_verbatim)],
      ["source_document", (r) => r.source_document],
      ["source_url", (r) => r.source_url],
      ["notes", (r) => text(r.notes)],
    ],
  },
  {
    table: "midh_area_limits",
    file: "midh_protected_cultivation_area_limits.csv",
    columns: [
      ["scheme", (r) => r.scheme],
      ["rule", (r) => r.rule],
      ["value", (r) => r.value],
      ["unit", (r) => r.unit],
      ["effective_from", (r) => r.effective_from],
      ["source_document", (r) => r.source_document],
      ["source_url", (r) => r.source_url],
      ["notes", (r) => text(r.notes)],
    ],
  },
  {
    table: "district_climate_monthly",
    file: "district_climate_monthly.csv",
    columns: [
      ["state", (r) => r.state],
      ["district", (r) => r.district],
      ["latitude", (r) => num(r.latitude)],
      ["longitude", (r) => num(r.longitude)],
      ["geocoder_matched_name", (r) => r.geocoder_matched_name],
      ["geonames_id", (r) => num(r.geonames_id)],
      ["elevation_m", (r) => num(r.elevation_m)],
      ["month", (r) => r.month],
      ["t2m_mean_c", (r) => num(r.t2m_mean_c)],
      ["t2m_max_c", (r) => num(r.t2m_max_c)],
      ["t2m_min_c", (r) => num(r.t2m_min_c)],
      ["rh2m_pct", (r) => num(r.rh2m_pct)],
      ["precip_mm_per_day", (r) => num(r.precip_mm_per_day)],
      ["solar_mj_m2_per_day", (r) => num(r.solar_mj_m2_per_day)],
      ["wind_2m_m_per_s", (r) => num(r.wind_2m_m_per_s)],
    ],
  },
  {
    table: "district_climate_unresolved",
    file: "district_climate_unresolved.csv",
    columns: [
      ["state", (r) => r.state],
      ["district", (r) => r.district],
      ["reason", (r) => r.reason],
    ],
  },
];

// Poultry planner reference data (supabase/migrations/20261020020000_poultry_reference_data.sql).
const POULTRY_TABLES = [
  {
    table: "poultry_unit_costs",
    file: "nabard_poultry_unit_costs.csv",
    columns: [
      ["state", (r) => r.state],
      ["year", (r) => r.year],
      ["bird_type", (r) => r.bird_type],
      ["system", (r) => r.system],
      ["birds", (r) => num(r.birds)],
      ["unit_cost_inr", (r) => num(r.unit_cost_inr)],
      ["repayment_years", (r) => num(r.repayment_years)],
      ["source_document", (r) => r.source_document],
      ["source_url", (r) => r.source_url],
      ["notes", (r) => text(r.notes)],
    ],
  },
  {
    table: "poultry_production_norms",
    file: "poultry_production_norms.csv",
    columns: [
      ["bird_type", (r) => r.bird_type],
      ["housing", (r) => r.housing],
      ["sqft_per_bird", (r) => num(r.sqft_per_bird)],
      ["rearing_days", (r) => num(r.rearing_days)],
      ["cleaning_days", (r) => num(r.cleaning_days)],
      ["mortality_pct", (r) => num(r.mortality_pct)],
      ["sale_weight_kg", (r) => num(r.sale_weight_kg)],
      ["feed_kg_per_bird", (r) => num(r.feed_kg_per_bird)],
      ["grower_weeks", (r) => num(r.grower_weeks)],
      ["laying_weeks", (r) => num(r.laying_weeks)],
      ["eggs_per_hen", (r) => num(r.eggs_per_hen)],
      ["laying_mortality_pct", (r) => num(r.laying_mortality_pct)],
      ["fcr", (r) => num(r.fcr)],
      ["source_ids", (r) => r.source_ids],
    ],
  },
  {
    table: "poultry_scheme_rules",
    file: "poultry_scheme_rules.csv",
    columns: [
      ["scheme_id", (r) => r.scheme_id],
      ["scheme", (r) => r.scheme],
      ["state", (r) => text(r.state)],
      ["unit", (r) => r.unit],
      ["percent_general", (r) => num(r.percent_general)],
      ["percent_sc_st", (r) => num(r.percent_sc_st)],
      ["cap_inr", (r) => num(r.cap_inr)],
      ["min_own_contribution_pct", (r) => num(r.min_own_contribution_pct)],
      ["min_parent_females", (r) => num(r.min_parent_females)],
      ["min_parent_males", (r) => num(r.min_parent_males)],
      ["greenfield_only", (r) => bool(r.greenfield_only)],
      ["min_years_operation", (r) => num(r.min_years_operation)],
      ["verified", (r) => bool(r.verified)],
      ["source_document", (r) => r.source_document],
      ["source_url", (r) => r.source_url],
      ["notes", (r) => text(r.notes)],
    ],
  },
  {
    table: "poultry_siting_rules",
    file: "poultry_siting_rules.csv",
    columns: [
      ["rule_id", (r) => r.rule_id],
      ["description", (r) => r.description],
      ["distance_m", (r) => num(r.distance_m)],
      ["applies_above_birds", (r) => num(r.applies_above_birds)],
      ["applies_to", (r) => r.applies_to],
      ["source_document", (r) => r.source_document],
      ["source_url", (r) => r.source_url],
    ],
  },
];
TABLES.push(...POULTRY_TABLES);

const BATCH = 500;

/**
 * @param {(sql: string, params?: unknown[]) => Promise<unknown>} query
 * @param {string} [csvDir]
 * @param {{ only?: "poultry" }} [options]  "poultry" loads only the poultry_* tables
 */
async function loadReferenceData(query, csvDir = CSV_DIR, { only } = {}) {
  const counts = {};
  const tables = only === "poultry" ? POULTRY_TABLES : TABLES;
  for (const { table, file, columns } of tables) {
    const records = parseCsv(fs.readFileSync(path.join(csvDir, file), "utf8"));
    await query(`truncate table public.${table} restart identity`);
    const names = columns.map(([name]) => name);
    for (let start = 0; start < records.length; start += BATCH) {
      const batch = records.slice(start, start + BATCH);
      const params = [];
      const tuples = batch.map((record) => {
        const placeholders = columns.map(([, convert]) => {
          params.push(convert(record));
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await query(`insert into public.${table} (${names.join(", ")}) values ${tuples.join(", ")}`, params);
    }
    counts[table] = records.length;
  }
  return counts;
}

module.exports = { loadReferenceData, parseCsv, POULTRY_TABLES };

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  const { connectDb, query, closeDb } = require("../config/db");
  (async () => {
    if (!(await connectDb())) throw new Error("DATABASE_URL is not configured");
    const only = process.argv[2] === "poultry" ? "poultry" : undefined;
    const counts = await loadReferenceData(query, CSV_DIR, { only });
    console.log("Loaded:", counts);
    await closeDb();
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
