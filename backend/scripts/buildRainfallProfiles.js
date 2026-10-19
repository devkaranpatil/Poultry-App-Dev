// Turns the IMD district rainfall normals (data.gov.in, "District Rainfall Normal (mm) monthly, seasonal
// and annual data, period 1951-2000") into backend/data/rainfallProfiles.json, so the cost model can use
// each district's real annual rainfall instead of one typed number per state.
//
// The dataset has no API: open https://www.data.gov.in/resource/district-rainfall-normal-mm-monthly-seasonal-and-annual-data-period-1951-2000
// in a browser, download the CSV, and save it as datasets/csv/imd_district_rainfall_normals.csv. Then:
//
//   node backend/scripts/buildRainfallProfiles.js
//
// Districts that cannot be matched to the app's list are written to datasets/csv/imd_rainfall_unmatched.csv
// and keep the state value; nothing is guessed.

const fs = require("fs");
const path = require("path");
const { parseCsv } = require("./loadReferenceData");

const SOURCE_CSV = path.resolve(__dirname, "../../datasets/csv/imd_district_rainfall_normals.csv");
const UNMATCHED_CSV = path.resolve(__dirname, "../../datasets/csv/imd_rainfall_unmatched.csv");
const OUTPUT_JSON = path.resolve(__dirname, "../data/rainfallProfiles.json");
const LOCATIONS = require("../../shared/india-locations.json");

// Names the 1951-2000 data used for states that were renamed since.
const STATE_ALIASES = {
  orissa: "odisha",
  uttaranchal: "uttarakhand",
  pondicherry: "puducherry",
  "nct of delhi": "delhi",
  "andaman and nicobar": "andaman and nicobar islands",
};

// Sanity band for an annual normal in India (Jaisalmer is about 200 mm, Mawsynram about 11,800 mm).
const MIN_ANNUAL_MM = 100;
const MAX_ANNUAL_MM = 12500;

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(district|dist|urban|rural)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normalizeState = (value) => {
  const key = normalize(value);
  return STATE_ALIASES[key] || key;
};

/** Finds the column for a field whatever the exact header spelling is ("STATE/UT", "state_ut", ...). */
function findColumn(headers, patterns) {
  return headers.find((header) => patterns.some((pattern) => pattern.test(header.toLowerCase().replace(/[^a-z]+/g, ""))));
}

/**
 * @param {string} csvText the IMD CSV
 * @param {Record<string, string[]>} locations app states and their districts
 * @returns {{ districts: Record<string, { annualMm: number }>, unmatched: Array<{state: string, district: string, annualMm: number}>, skipped: number }}
 */
function buildProfiles(csvText, locations = LOCATIONS) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("The rainfall file has no rows");
  const headers = Object.keys(rows[0]);
  const stateColumn = findColumn(headers, [/^stateut$/, /^state$/, /^statename$/]);
  const districtColumn = findColumn(headers, [/^district$/, /^districtname$/]);
  const annualColumn = findColumn(headers, [/^annual$/, /^ann$/, /^annualrainfall$/, /^annualmm$/]);
  if (!stateColumn || !districtColumn || !annualColumn) {
    throw new Error(`Cannot find STATE, DISTRICT and ANNUAL columns in: ${headers.join(", ")}`);
  }

  // The app's districts, by normalised state and by normalised name across all states.
  const byState = new Map();
  const byName = new Map();
  for (const [state, districts] of Object.entries(locations)) {
    const names = new Map(districts.map((district) => [normalize(district), district]));
    byState.set(normalizeState(state), { state, names });
    for (const [key, district] of names) {
      const list = byName.get(key) || [];
      list.push({ state, district });
      byName.set(key, list);
    }
  }

  const districts = {};
  const unmatched = [];
  let skipped = 0;
  for (const row of rows) {
    const annualMm = Number(String(row[annualColumn]).replace(/,/g, "").trim());
    if (!Number.isFinite(annualMm) || annualMm < MIN_ANNUAL_MM || annualMm > MAX_ANNUAL_MM) {
      skipped += 1;
      continue;
    }
    const stateEntry = byState.get(normalizeState(row[stateColumn]));
    const key = normalize(row[districtColumn]);
    let match = stateEntry && stateEntry.names.has(key) ? { state: stateEntry.state, district: stateEntry.names.get(key) } : null;
    // Telangana, Jharkhand and others were part of another state in 1951-2000. Fall back to the name alone,
    // but only when exactly one district in the whole country has it.
    if (!match) {
      const candidates = byName.get(key) || [];
      if (candidates.length === 1) match = candidates[0];
    }
    if (match) districts[`${match.state}|${match.district}`] = { annualMm: Math.round(annualMm) };
    else unmatched.push({ state: row[stateColumn], district: row[districtColumn], annualMm: Math.round(annualMm) });
  }
  return { districts, unmatched, skipped };
}

function main() {
  if (!fs.existsSync(SOURCE_CSV)) {
    console.error(`Missing ${path.relative(process.cwd(), SOURCE_CSV)}. See the instructions at the top of this script.`);
    process.exit(1);
  }
  const { districts, unmatched, skipped } = buildProfiles(fs.readFileSync(SOURCE_CSV, "utf8"));
  const total = Object.values(LOCATIONS).reduce((sum, list) => sum + list.length, 0);
  fs.writeFileSync(
    OUTPUT_JSON,
    JSON.stringify(
      {
        source: "IMD district rainfall normals 1951-2000 (data.gov.in), annual total in mm",
        generatedFrom: "datasets/csv/imd_district_rainfall_normals.csv",
        districts,
      },
      null,
      1
    ) + "\n"
  );
  fs.writeFileSync(
    UNMATCHED_CSV,
    ["state,district,annual_mm", ...unmatched.map((row) => `"${row.state}","${row.district}",${row.annualMm}`)].join("\n") + "\n"
  );
  console.log(`Matched ${Object.keys(districts).length} of ${total} app districts; ${unmatched.length} IMD rows unmatched; ${skipped} rows skipped (no valid annual value).`);
}

if (require.main === module) main();

module.exports = { buildProfiles, normalize, normalizeState };
