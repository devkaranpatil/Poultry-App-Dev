// Official reference data loaded into Postgres (datasets/csv) that puts a calculation in context: the district's
// own monthly climate from NASA POWER. None of it feeds the figures, so a calculation never changes because of
// it, and every function degrades to null when the database is unavailable.

const { query, getDbStatus } = require("../config/db");

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function clearReferenceCache() {
  cache.clear();
}

const num = (value) => (value === null || value === undefined ? null : Number(value));
const round = (value) => Math.round(Number(value));

async function loadDistrictClimate(state, district) {
  const { rows } = await query(
    `select month, t2m_mean_c, t2m_max_c, t2m_min_c, rh2m_pct, precip_mm_per_day, solar_mj_m2_per_day, wind_2m_m_per_s,
            latitude, longitude, elevation_m
     from district_climate_monthly where state = $1 and district = $2`,
    [state, district]
  );
  if (rows.length === 0) return null;
  const annual = rows.find((r) => r.month === "ANN");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    .map((m) => rows.find((r) => r.month === m))
    .filter(Boolean)
    .map((r) => ({
      month: r.month,
      meanTempC: num(r.t2m_mean_c),
      maxTempC: num(r.t2m_max_c),
      minTempC: num(r.t2m_min_c),
      humidityPct: num(r.rh2m_pct),
      rainMmPerDay: num(r.precip_mm_per_day),
    }));
  if (!annual || months.length !== 12) return null;
  return {
    annualMeanTempC: num(annual.t2m_mean_c),
    annualHumidityPct: num(annual.rh2m_pct),
    annualRainfallMm: round(num(annual.precip_mm_per_day) * 365),
    hottestMonthMeanC: Math.max(...months.map((m) => m.meanTempC)),
    // NASA's max/min are the highest and lowest HOURLY readings in a month: extremes, not typical days.
    hottestMonthMaxTempC: Math.max(...months.map((m) => m.maxTempC)),
    coldestMonthMinTempC: Math.min(...months.map((m) => m.minTempC)),
    elevationM: num(annual.elevation_m),
    months,
  };
}

/**
 * Official context for one calculation, or null when the data is not available.
 * @param config  a normalised, valid setup (stateName, district)
 */
async function buildReference(config) {
  if (getDbStatus().state !== "connected" || !config.district) return null;
  try {
    const districtClimate = await cached(`climate:${config.stateName}:${config.district}`, () =>
      loadDistrictClimate(config.stateName, config.district)
    );
    return {
      districtClimate: districtClimate
        ? {
            ...districtClimate,
            source: "NASA POWER 25-year climatology (2001-2025) at the district's coordinates",
            note: "Shown for context. Heat stress uses the monthly means of the same climatology.",
          }
        : null,
    };
  } catch (error) {
    console.error("Reference data lookup failed:", error.message);
    return null;
  }
}

module.exports = { buildReference, clearReferenceCache, loadDistrictClimate };
