// How much the price of a crop varies, for the Monte Carlo model, from the mandi prices the daily ingest stores
// (public.mandi_prices_daily, Agmarknet via data.gov.in). The best available evidence wins:
//   history     60+ days of national daily medians: how the price moves over time (includes seasons)
//   markets     the latest day across 20+ markets: how much the price differs by where you sell
//   assumption  no data for this crop (or no database): a stated assumption, flagged as such
// The spread is the standard deviation of the natural log of price, so 0.3 means roughly +/-30%.

const { query, getDbStatus } = require("../../config/db");
const { MANDI_COMMODITY } = require("../marketPrices");

const MIN_HISTORY_DAYS = 60;
const MIN_MARKETS = 20;
// Close to the spread measured across 160 tomato markets on 2026-10-13 (0.29); used only without data.
const ASSUMED_SIGMA_LOG = 0.3;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map();
const assumption = () => ({ sigmaLog: ASSUMED_SIGMA_LOG, basis: "assumption", days: 0, markets: 0, from: null, to: null });

async function measure(commodity) {
  const history = await query(
    `with daily as (
       select arrival_date, percentile_cont(0.5) within group (order by modal_price) as median
       from mandi_prices_daily where commodity = $1 and modal_price > 0 group by arrival_date)
     select count(*)::int as days, stddev(ln(median)) as sigma, min(arrival_date)::text as first_day, max(arrival_date)::text as last_day
     from daily`,
    [commodity]
  );
  const h = history.rows[0];
  if (h && h.days >= MIN_HISTORY_DAYS && Number(h.sigma) > 0) {
    return { sigmaLog: Number(Number(h.sigma).toFixed(3)), basis: "history", days: h.days, markets: 0, from: h.first_day, to: h.last_day };
  }

  const latest = await query(
    `select count(*)::int as markets, stddev(ln(modal_price)) as sigma, max(arrival_date)::text as day
     from mandi_prices_daily
     where commodity = $1 and modal_price > 0
       and arrival_date = (select max(arrival_date) from mandi_prices_daily where commodity = $1)`,
    [commodity]
  );
  const l = latest.rows[0];
  if (l && l.markets >= MIN_MARKETS && Number(l.sigma) > 0) {
    return { sigmaLog: Number(Number(l.sigma).toFixed(3)), basis: "markets", days: 1, markets: l.markets, from: l.day, to: l.day };
  }
  return assumption();
}

/** @param {string} cropName  the planner's crop key ("tomato") or name ("Tomato") */
async function loadPriceSpread(cropName) {
  const name = String(cropName || "");
  const commodity = MANDI_COMMODITY[name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()];
  if (!commodity || getDbStatus().state !== "connected") return assumption();

  const hit = cache.get(commodity);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  try {
    const value = await measure(commodity);
    cache.set(commodity, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.error("Price spread lookup failed:", error.message);
    return assumption();
  }
}

const clearPriceSpreadCache = () => cache.clear();

module.exports = { ASSUMED_SIGMA_LOG, MIN_HISTORY_DAYS, MIN_MARKETS, clearPriceSpreadCache, loadPriceSpread };
