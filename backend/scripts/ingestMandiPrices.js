// Fetches today's mandi prices from the official data.gov.in API and upserts them into
// public.mandi_prices_daily. The source only publishes a current-day snapshot, so run this daily
// (cron, a scheduled GitHub Action, or Supabase pg_cron + an Edge Function) to build price history.
// Re-running on the same day is safe: rows are keyed by market, commodity, variety, grade and date.
//
//   DATA_GOV_IN_API_KEY in backend/.env   (free: sign in at https://data.gov.in -> My Account)
//   node backend/scripts/ingestMandiPrices.js [Commodity ...]
//
// With no arguments it ingests the crops the app advises on. Names must match Agmarknet exactly
// (cucumber is published as "Cucumbar(Kheera)"; lettuce, strawberry and gerbera are not on the feed).

const path = require("path");

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const PAGE = 500;
const DEFAULT_COMMODITIES = ["Tomato", "Capsicum", "Cucumbar(Kheera)", "Lettuce", "Strawberry", "Gerbera"];

/** The API publishes dates as dd/mm/yyyy (and sometimes yyyy-mm-dd). Returns an ISO date or null. */
function parseArrivalDate(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** Prices arrive as strings ("2400") and sometimes as "NA" or empty: keep numbers, drop the rest. */
const parsePrice = (value) => {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return String(value ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

/** One API record -> one table row, or null when it cannot be stored (no date, market or any price). */
function parseRecord(record) {
  const arrivalDate = parseArrivalDate(record.arrival_date);
  const row = {
    state: String(record.state || "").trim(),
    district: String(record.district || "").trim(),
    market: String(record.market || "").trim(),
    commodity: String(record.commodity || "").trim(),
    variety: String(record.variety || "").trim(),
    grade: String(record.grade || "").trim(),
    arrival_date: arrivalDate,
    min_price: parsePrice(record.min_price),
    max_price: parsePrice(record.max_price),
    modal_price: parsePrice(record.modal_price),
  };
  const hasPrice = row.min_price !== null || row.max_price !== null || row.modal_price !== null;
  return row.arrival_date && row.state && row.market && row.commodity && hasPrice ? row : null;
}

const COLUMNS = ["state", "district", "market", "commodity", "variety", "grade", "arrival_date", "min_price", "max_price", "modal_price"];
const BATCH = 200;

/** Upserts rows; returns how many were written. Duplicate keys inside one batch are collapsed first. */
async function upsertPrices(query, rows) {
  let written = 0;
  for (let start = 0; start < rows.length; start += BATCH) {
    const unique = new Map();
    for (const row of rows.slice(start, start + BATCH)) {
      unique.set([row.state, row.district, row.market, row.commodity, row.variety, row.grade, row.arrival_date].join("|"), row);
    }
    const params = [];
    const tuples = [...unique.values()].map((row) => {
      const placeholders = COLUMNS.map((column) => {
        params.push(row[column]);
        return column === "arrival_date" ? `$${params.length}::date` : `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await query(
      `insert into public.mandi_prices_daily (${COLUMNS.join(", ")}) values ${tuples.join(", ")}
       on conflict on constraint mandi_prices_daily_key do update
         set min_price = excluded.min_price, max_price = excluded.max_price, modal_price = excluded.modal_price, fetched_at = now()`,
      params
    );
    written += unique.size;
  }
  return written;
}

async function fetchCommodity(apiKey, commodity, fetchImpl = fetch) {
  const rows = [];
  let skipped = 0;
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${encodeURIComponent(apiKey)}&format=json` +
      `&limit=${PAGE}&offset=${offset}&filters[commodity]=${encodeURIComponent(commodity)}`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      // Never echo the URL: it contains the API key.
      throw new Error(`data.gov.in answered HTTP ${response.status} for ${commodity}`);
    }
    const body = await response.json();
    const records = Array.isArray(body.records) ? body.records : [];
    for (const record of records) {
      // The API filter is loose (Capsicum also returns "Chilly Capsicum"): keep exact commodity matches only.
      if (String(record.commodity || "").trim().toLowerCase() !== commodity.toLowerCase()) continue;
      const row = parseRecord(record);
      row ? rows.push(row) : skipped++;
    }
    if (records.length < PAGE) break;
  }
  return { rows, skipped };
}

module.exports = { parseArrivalDate, parsePrice, parseRecord, upsertPrices, fetchCommodity, DEFAULT_COMMODITIES };

if (require.main === module) {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
  const { connectDb, query, closeDb } = require("../config/db");

  (async () => {
    const apiKey = String(process.env.DATA_GOV_IN_API_KEY || "").trim();
    if (!apiKey) throw new Error("Set DATA_GOV_IN_API_KEY in backend/.env (free key from https://data.gov.in).");
    if (!(await connectDb())) throw new Error("DATABASE_URL is not configured.");

    const commodities = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_COMMODITIES;
    let total = 0;
    for (const commodity of commodities) {
      const { rows, skipped } = await fetchCommodity(apiKey, commodity);
      const written = await upsertPrices(query, rows);
      total += written;
      console.log(`${commodity}: ${written} rows stored${skipped ? `, ${skipped} skipped (no usable price/date)` : ""}${rows.length === 0 ? " (nothing published today)" : ""}`);
    }
    await closeDb();
    // Some crops are never on the feed, but zero rows overall means a broken key, filter or outage:
    // fail loudly so a scheduled run is flagged instead of passing silently.
    if (total === 0) throw new Error("No prices were stored for any commodity. Check the API key and the commodity names.");
  })().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
