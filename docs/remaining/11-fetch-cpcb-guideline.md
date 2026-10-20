# 11. Fetch the CPCB guideline text

**Status:** open. The page timed out on 2026-10-20.

## Why it is open

`cpcb-poultry-guidelines` in `datasets/knowledge/manifest.json` points at the India Environment Portal page for the
CPCB Environmental Guidelines for Poultry Farms. It timed out (and once returned 502) on every try, so its text is not
in the assistant's index. The rules the planner uses from it (consent above 5,000 birds, 500 m from homes, 100 m from
water) are already in `datasets/csv/poultry_siting_rules.csv`, so the app and the assistant still have them.

## What to do

1. Try again: `python datasets/scripts/fetch_knowledge.py` (it fetches only what is missing).
2. If the page stays down, find the CPCB PDF itself (CPCB circulated the revised guidelines to the state boards in
   January 2022) and change the source's `url` and `format: "pdf"` in the manifest.
3. Remove the matching line from the manifest's `gaps`.

## Done when

`datasets/knowledge/text/cpcb-poultry-guidelines.txt` exists, the backend's status (`/api/ai/status`) lists 34
documents (33 now), and `npm run eval:assistant -- --only=cpcb-consent,cpcb-residential,cpcb-water,edge-typos` passes.
