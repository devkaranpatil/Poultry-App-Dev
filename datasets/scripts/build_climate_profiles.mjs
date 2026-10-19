// Builds backend/data/climateProfiles.json from the NASA POWER district climatology in
// datasets/csv/district_climate_monthly.csv, so the calculator can use real temperatures without
// a database. Re-run after regenerating the climate CSV:
//
//   node datasets/scripts/build_climate_profiles.mjs
//
// Per district: the mean temperature of the hottest month (the 24-hour mean, MERRA-2 T2M).
// Per state: the mean of its districts' annual temperature, annual humidity and hottest-month mean.
// T2M_MAX is deliberately not used: NASA defines it as the maximum HOURLY reading in the period,
// an extreme (Shimla reads 43.9 C), which says nothing about a typical hot month.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { parseCsv } = require(path.resolve(here, "../../backend/scripts/loadReferenceData.js"));

const rows = parseCsv(fs.readFileSync(path.resolve(here, "../csv/district_climate_monthly.csv"), "utf8"));
const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const byDistrict = new Map();
for (const r of rows) {
  const key = `${r.state}|${r.district}`;
  if (!byDistrict.has(key)) byDistrict.set(key, { state: r.state, months: [], annual: null });
  const entry = byDistrict.get(key);
  if (r.month === "ANN") entry.annual = r;
  else entry.months.push(r);
}

const districts = {};
const stateAcc = new Map();
for (const [key, { state, months, annual }] of [...byDistrict.entries()].sort()) {
  if (months.length !== 12 || !annual) continue; // incomplete districts are left out, not guessed
  const hottest = months.reduce((a, b) => (Number(b.t2m_mean_c) > Number(a.t2m_mean_c) ? b : a));
  districts[key] = { hottestMonthMeanC: round1(Number(hottest.t2m_mean_c)), hottestMonth: hottest.month };
  if (!stateAcc.has(state)) stateAcc.set(state, { temp: [], rh: [], hot: [] });
  const acc = stateAcc.get(state);
  acc.temp.push(Number(annual.t2m_mean_c));
  acc.rh.push(Number(annual.rh2m_pct));
  acc.hot.push(Number(hottest.t2m_mean_c));
}

const states = {};
for (const [state, acc] of [...stateAcc.entries()].sort()) {
  states[state] = {
    districts: acc.temp.length,
    annualMeanTempC: round1(mean(acc.temp)),
    annualHumidityPct: Math.round(mean(acc.rh)),
    hottestMonthMeanC: round1(mean(acc.hot)),
  };
}

const out = {
  source: "NASA POWER 25-year monthly climatology (2001-2025), community AG, parameters T2M and RH2M; see datasets/README.md",
  generatedFrom: "datasets/csv/district_climate_monthly.csv",
  states,
  districts,
};
const target = path.resolve(here, "../../backend/data/climateProfiles.json");
fs.writeFileSync(target, `${JSON.stringify(out, null, 1)}\n`);
console.log(`Wrote ${Object.keys(districts).length} districts and ${Object.keys(states).length} states to ${path.relative(process.cwd(), target)}`);
