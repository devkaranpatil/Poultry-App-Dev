// Downloads daily mandi (wholesale market) prices from the official data.gov.in open-data API into
// datasets/csv/mandi_prices_daily.csv. Nothing is generated: every row is a record returned by the API.
//
// REQUIRES a free data.gov.in API key (sign in at https://data.gov.in, "My Account" -> API key):
//   DATA_GOV_IN_API_KEY=... node datasets/scripts/fetch_mandi_prices.mjs [commodity ...]
//
// NOTE: this script has not been run by the author because it needs a personal key. The resource id and
// field names below are those published for the dataset "Current Daily Price of Various Commodities
// from Various Markets (Mandi)" - check them against the resource page if the API answers with an error.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.DATA_GOV_IN_API_KEY;
if (!apiKey) {
  console.error("Set DATA_GOV_IN_API_KEY (free from https://data.gov.in).");
  process.exit(1);
}

const RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const PAGE = 500;
const commodities = process.argv.slice(2).length ? process.argv.slice(2) : ["Tomato", "Capsicum", "Cucumber", "Lettuce", "Strawberry", "Gerbera"];
const FIELDS = ["state", "district", "market", "commodity", "variety", "grade", "arrival_date", "min_price", "max_price", "modal_price"];

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "csv");
mkdirSync(outDir, { recursive: true });

const esc = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : (v ?? ""));
const rows = [];

for (const commodity of commodities) {
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${apiKey}&format=json&limit=${PAGE}&offset=${offset}` +
      `&filters[commodity]=${encodeURIComponent(commodity)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`${commodity}: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
      break;
    }
    const body = await res.json();
    const records = body.records || [];
    for (const r of records) rows.push(FIELDS.map((f) => r[f] ?? r[f.replace(/_/g, " ")] ?? ""));
    console.log(`${commodity}: ${offset + records.length} records`);
    if (records.length < PAGE) break;
  }
}

writeFileSync(join(outDir, "mandi_prices_daily.csv"), [FIELDS, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n");
console.log(`wrote ${rows.length} rows`);
