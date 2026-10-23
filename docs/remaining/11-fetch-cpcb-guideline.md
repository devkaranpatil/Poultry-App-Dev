# 11. Fetch the CPCB guideline text

**Status:** fixed in code on 2026-10-23; to confirm with the eval questions under "Done when" (the rerun of task 01).

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

## What was done (2026-10-23)

The page answered on 2026-10-23. fetch_knowledge.py now trims a page to the manifest fields textStart and textEnd, so the site menus are left out (274 words). The page is a summary of the NGT orders (consent above 5,000 birds); the siting distances are not in it. The manifest gap now says that the CPCB PDF itself is missing. /api/ai/status lists 34 documents.

## Done when

`datasets/knowledge/text/cpcb-poultry-guidelines.txt` exists, the backend's status (`/api/ai/status`) lists 34
documents (33 now), and `npm run eval:assistant -- --only=cpcb-consent,cpcb-residential,cpcb-water,edge-typos` passes.
