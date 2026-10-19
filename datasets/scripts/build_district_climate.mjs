// Builds datasets/csv/district_climate_monthly.csv from live public APIs. No value in the output is
// synthesised: every number is returned by an API.
//
//   Locations   shared/india-locations.json (the app's own state -> districts list)
//   Coordinates GeoNames, via the Open-Meteo geocoding API (NOT a government source; see README)
//   Climate     NASA POWER monthly climatology, community AG (https://power.larc.nasa.gov)
//
// Resumable: raw API responses are cached in datasets/.cache so a re-run only fetches what is missing.
// Usage: node datasets/scripts/build_district_climate.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const locations = JSON.parse(readFileSync(join(root, "shared", "india-locations.json"), "utf8"));
const cacheDir = join(root, "datasets", ".cache");
const outDir = join(root, "datasets", "csv");
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "RH2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "WS2M"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC", "ANN"];
const CONCURRENCY = 4;

// GeoNames spells a few states differently from the app's list.
const STATE_ALIASES = {
  odisha: ["odisha", "orissa"],
  uttarakhand: ["uttarakhand", "uttaranchal"],
  telangana: ["telangana", "andhra pradesh"], // GeoNames lists some Telangana districts under the pre-2014 state
  "andhra pradesh": ["andhra pradesh"],
};
const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, "").trim();
const stateMatches = (admin1, state) => (STATE_ALIASES[norm(state)] || [norm(state)]).includes(norm(admin1 || ""));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { __error: `HTTP ${res.status}` };
      return await res.json();
    } catch (err) {
      if (attempt === retries) return { __error: String(err) };
      await sleep(1500 * (attempt + 1));
    }
  }
}

const cacheFile = (name) => join(cacheDir, name);
const readCache = (name) => (existsSync(cacheFile(name)) ? JSON.parse(readFileSync(cacheFile(name), "utf8")) : null);
const writeCache = (name, value) => writeFileSync(cacheFile(name), JSON.stringify(value));
const slug = (s) => norm(s).replace(/ /g, "_");

async function geocode(state, district) {
  const key = `geo_${slug(state)}__${slug(district)}.json`;
  const cached = readCache(key);
  if (cached) return cached;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(district)}&count=20&language=en&format=json&countryCode=IN`;
  const body = await getJson(url);
  const hits = (body.results || []).filter((r) => stateMatches(r.admin1, state));
  // Prefer the district-level administrative feature, then any populated place, then the first hit.
  const pick = hits.find((r) => r.feature_code === "ADM2") || hits.find((r) => String(r.feature_code).startsWith("PPL")) || hits[0] || null;
  const result = pick
    ? { latitude: pick.latitude, longitude: pick.longitude, matched_name: pick.name, geonames_id: pick.id, feature_code: pick.feature_code, admin1: pick.admin1 }
    : { unresolved: true, error: body.__error || "no match in the correct state" };
  // Do not cache transient network failures, only genuine "no match" answers.
  if (!body.__error) writeCache(key, result);
  return result;
}

async function climate(state, district, lat, lon) {
  const key = `power_${slug(state)}__${slug(district)}.json`;
  const cached = readCache(key);
  if (cached) return cached;
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${PARAMS.join(",")}` +
    `&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  const body = await getJson(url);
  if (body.__error || !body.properties?.parameter) return { error: body.__error || "no parameter block" };
  const slim = { elevation_m: body.geometry?.coordinates?.[2], parameter: body.properties.parameter };
  writeCache(key, slim);
  return slim;
}

const jobs = [];
for (const [state, districts] of Object.entries(locations)) for (const district of districts) jobs.push({ state, district });
const total = jobs.length;

const rows = [];
const unresolved = [];
let done = 0;

async function worker() {
  while (jobs.length) {
    const { state, district } = jobs.shift();
    const geo = await geocode(state, district);
    if (geo.unresolved) {
      unresolved.push({ state, district, reason: geo.error });
    } else {
      const c = await climate(state, district, geo.latitude, geo.longitude);
      if (c.error) {
        unresolved.push({ state, district, reason: `NASA POWER: ${c.error}` });
      } else {
        for (const m of MONTHS) {
          const v = (p) => {
            const x = c.parameter[p]?.[m];
            return x === undefined || x === -999 ? "" : x;
          };
          rows.push([
            state, district, geo.latitude, geo.longitude, geo.matched_name, geo.geonames_id, c.elevation_m ?? "", m,
            v("T2M"), v("T2M_MAX"), v("T2M_MIN"), v("RH2M"), v("PRECTOTCORR"), v("ALLSKY_SFC_SW_DWN"), v("WS2M"),
          ]);
        }
      }
    }
    if (++done % 25 === 0) console.log(`${done}/${total} districts processed`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
const header = [
  "state", "district", "latitude", "longitude", "geocoder_matched_name", "geonames_id", "elevation_m", "month",
  "t2m_mean_c", "t2m_max_c", "t2m_min_c", "rh2m_pct", "precip_mm_per_day", "solar_mj_m2_per_day", "wind_2m_m_per_s",
];
rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || MONTHS.indexOf(a[7]) - MONTHS.indexOf(b[7]));
writeFileSync(join(outDir, "district_climate_monthly.csv"), [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n");
writeFileSync(
  join(outDir, "district_climate_unresolved.csv"),
  [["state", "district", "reason"], ...unresolved.map((u) => [u.state, u.district, u.reason])].map((r) => r.map(esc).join(",")).join("\n") + "\n"
);
console.log(`rows: ${rows.length} (${rows.length / 13} districts), unresolved: ${unresolved.length}`);
