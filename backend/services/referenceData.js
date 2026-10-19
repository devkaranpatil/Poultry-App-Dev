// Official reference data (datasets/csv, loaded into Postgres) used to put a calculation in context:
// the government cost norm, the per-beneficiary area limit, an indicative subsidy and the district's
// own climate. None of it feeds the price model, so a calculation never changes because of it, and
// every function degrades to null when the database is unavailable.

const { query, getDbStatus } = require("../config/db");
const { round } = require("./costModel");
const { buildMarketPrices, loadLatestPrices } = require("./marketPrices");

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

async function loadCostNorms() {
  const { rows } = await query(
    "select component, structure_type, cost_norm_inr, cost_norm_hilly_inr, pattern_of_assistance_verbatim, source_document, source_url from cost_norms where scheme = 'MIDH/NHB'"
  );
  return rows;
}

async function loadAreaLimit() {
  const { rows } = await query(
    `select value, unit, effective_from::text as effective_from, source_document, source_url from midh_area_limits
     where scheme = 'MIDH - NHM/HMNEH sub-schemes' and rule = 'max protected cultivation area per beneficiary'
     order by effective_from desc limit 1`
  );
  return rows[0] || null;
}

/** Which row of the government table describes this structure. */
function normSelector({ structureType, structureMaterial }) {
  const bamboo = structureMaterial === "bamboo";
  if (structureType === "climate-controlled") return { component: "Green House Structure", structure: "Fan & Pad system" };
  if (structureType === "shade-net") return { component: "Shade Net House", structure: bamboo ? "Bamboo structure" : "Tubular structure" };
  return { component: "Green House Structure", structure: bamboo ? "Naturally ventilated - Bamboo structure" : "Naturally ventilated - Tubular structure" };
}

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
 * @param config  normalised + validated configuration
 * @param result  buildCalculationResult output (used for area and your own estimate)
 * @param typeField "greenhouseType" | "polyhouseType"
 */
async function buildReference(config, result, typeField) {
  if (getDbStatus().state !== "connected") return null;
  try {
    const [norms, areaLimit, districtClimate] = await Promise.all([
      cached("norms", loadCostNorms),
      cached("areaLimit", loadAreaLimit),
      config.district ? cached(`climate:${config.stateName}:${config.district}`, () => loadDistrictClimate(config.stateName, config.district)) : null,
    ]);

    const wanted = normSelector({ structureType: config[typeField], structureMaterial: config.structureMaterial });
    const row = norms.find((n) => n.component === wanted.component && n.structure_type === wanted.structure);
    const area = result.area;

    // The norm and the subsidy come from the calculation itself (data/subsidySchemes.js: MIDH 2025 slab rates
    // under 4,000 m2, NHB from 4,000 m2, as set by the letter of 12.08.2025), so this card and the returns
    // panel always agree. The database row only supplies the official labels when it is loaded.
    const scheme = result.subsidy;
    const governmentNorm = scheme
      ? {
          component: row?.component ?? "Green House Structure",
          structureType: row?.structure_type ?? wanted.structure,
          normPerSqmInr: scheme.normPerSqmInr,
          hillyNormPerSqmInr: scheme.scheme === "NHB" && row ? num(row.cost_norm_hilly_inr) : null,
          normCostInr: scheme.normCostInr,
          // The norm covers the structure and its cover, so compare it with those two lines of your estimate.
          yourStructureAndCoverInr: result.cost.structureCost + result.cost.coverCost,
          sourceDocument: scheme.source.document,
          sourceUrl: scheme.source.url,
        }
      : null;
    const indicativeSubsidy = scheme
      ? {
          scheme: scheme.scheme,
          percent: scheme.percent,
          eligibleAreaSqm: scheme.eligibleAreaSqm,
          amountInr: scheme.amountInr,
          cappedAtInr: scheme.cappedAtInr,
          basis: `${scheme.percent}% of cost, limited to the norm of Rs ${scheme.normPerSqmInr}/m2${scheme.capInr ? ` and Rs ${scheme.capInr} per project` : ""}`,
          disclaimer: ["Indicative only: eligibility, state top-ups and the final sanctioned cost decide the real amount.", ...scheme.notes].join(" "),
        }
      : null;

    return {
      governmentNorm,
      areaLimit: areaLimit
        ? {
            limitSqm: Number(areaLimit.value),
            exceedsLimit: area > Number(areaLimit.value),
            effectiveFrom: String(areaLimit.effective_from).slice(0, 10),
            sourceUrl: areaLimit.source_url,
          }
        : null,
      indicativeSubsidy,
      marketPrices: await buildMarketPrices({
        crops: result.crops,
        stateName: config.stateName,
        areaSqm: area,
        loader: (commodity, state) => cached(`mandi:${commodity}:${state}`, () => loadLatestPrices(commodity, state)),
      }),
      districtClimate: districtClimate
        ? {
            ...districtClimate,
            source: "NASA POWER 25-year climatology (2001-2025) at the district's coordinates",
            note: "Shown for context. The heat surcharge uses this district's hottest-month mean; the rain surcharge still uses the state profile.",
          }
        : null,
    };
  } catch (error) {
    console.error("Reference data lookup failed:", error.message);
    return null;
  }
}

module.exports = { buildReference, clearReferenceCache, normSelector };
