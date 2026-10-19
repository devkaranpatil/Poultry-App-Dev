// Latest mandi (wholesale market) prices from the official data.gov.in / Agmarknet feed, loaded into
// public.mandi_prices_daily by backend/scripts/ingestMandiPrices.js. A snapshot for context, not a
// forecast: the source publishes one day at a time. Prices are Rs per quintal (100 kg).

const { query } = require("../config/db");
const { round } = require("./costModel");

/** App crop name -> the commodity name Agmarknet publishes. Crops not on the feed are left out. */
const MANDI_COMMODITY = {
  Tomato: "Tomato",
  Capsicum: "Capsicum",
  Cucumber: "Cucumbar(Kheera)",
};

const STALE_AFTER_DAYS = 7;
// A state median from one or two markets says little about the state, so revenue falls back to national.
const MIN_STATE_MARKETS = 3;
const QUINTALS_PER_TONNE = 10;
const SQM_PER_HECTARE = 10000;

const num = (value) => (value === null || value === undefined ? null : Number(value));

/** "80-120 t/ha" -> { low: 80, high: 120 }. Other units (stems/m2/year) are not convertible to a sale value. */
function parseTonnesPerHectare(text) {
  const match = String(text || "").match(/^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*t\/ha\s*$/i);
  return match ? { low: Number(match[1]), high: Number(match[2]) } : null;
}

const summary = (n, median, low, high) =>
  n > 0 ? { markets: n, medianInrPerQuintal: round(num(median)), lowInrPerQuintal: round(num(low)), highInrPerQuintal: round(num(high)) } : null;

/** Latest published day for one commodity: nationwide and for one state. Null when nothing is stored. */
async function loadLatestPrices(commodity, state) {
  const { rows } = await query(
    `select (select max(arrival_date)::text from mandi_prices_daily where commodity = $1) as latest,
            count(distinct market) as n_all,
            percentile_cont(0.5) within group (order by modal_price) as med_all,
            min(modal_price) as lo_all, max(modal_price) as hi_all,
            count(distinct market) filter (where state = $2) as n_state,
            percentile_cont(0.5) within group (order by modal_price) filter (where state = $2) as med_state,
            min(modal_price) filter (where state = $2) as lo_state, max(modal_price) filter (where state = $2) as hi_state
     from mandi_prices_daily
     where commodity = $1 and modal_price is not null
       and arrival_date = (select max(arrival_date) from mandi_prices_daily where commodity = $1)`,
    [commodity, state]
  );
  const r = rows[0];
  if (!r || !r.latest || Number(r.n_all) === 0) return null;
  const ageDays = (Date.now() - new Date(`${r.latest}T00:00:00Z`).getTime()) / 86400000;
  return {
    date: r.latest,
    stale: ageDays > STALE_AFTER_DAYS,
    india: summary(Number(r.n_all), r.med_all, r.lo_all, r.hi_all),
    state: summary(Number(r.n_state), r.med_state, r.lo_state, r.hi_state),
  };
}

/**
 * Gross sale value for the whole floor area if the app's yield range is met, at today's median price.
 * Uses the state's median when at least MIN_STATE_MARKETS markets reported, otherwise the national median.
 */
function indicativeRevenue(yieldText, areaSqm, prices) {
  const yieldRange = parseTonnesPerHectare(yieldText);
  const stateIsSolid = prices.state && prices.state.markets >= MIN_STATE_MARKETS;
  const used = stateIsSolid ? prices.state : prices.india;
  if (!yieldRange || !used || !(areaSqm > 0)) return null;
  const hectares = areaSqm / SQM_PER_HECTARE;
  const perTonne = used.medianInrPerQuintal * QUINTALS_PER_TONNE;
  return {
    basis: stateIsSolid ? "state" : "india",
    lowInr: round(yieldRange.low * hectares * perTonne),
    highInr: round(yieldRange.high * hectares * perTonne),
  };
}

/**
 * Market snapshot for each suggested crop that has a mandi feed. Returns [] when there is nothing
 * to show, so callers can attach it without checking.
 * @param crops   result.crops from the calculator ({ name, expectedYield })
 * @param loader  (commodity, state) => Promise<latest prices | null>, cached by the caller
 */
async function buildMarketPrices({ crops, stateName, areaSqm, loader = loadLatestPrices }) {
  const out = [];
  for (const crop of crops) {
    const commodity = MANDI_COMMODITY[crop.name];
    if (!commodity) continue;
    const prices = await loader(commodity, stateName);
    if (!prices) continue;
    out.push({
      crop: crop.name,
      commodity,
      unit: "INR per quintal",
      date: prices.date,
      stale: prices.stale,
      state: prices.state,
      india: prices.india,
      revenue: indicativeRevenue(crop.expectedYield, areaSqm, prices),
      source: "Agmarknet via data.gov.in (current daily prices of commodities from mandis)",
    });
  }
  return out;
}

module.exports = { MANDI_COMMODITY, MIN_STATE_MARKETS, parseTonnesPerHectare, indicativeRevenue, loadLatestPrices, buildMarketPrices };
