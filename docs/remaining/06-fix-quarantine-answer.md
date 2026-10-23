# 06. Quarantine answered from the wrong rule

**Status:** fixed in code on 2026-10-23; to confirm with the eval questions under "Done when" (the rerun of task 01).

## The fault

"For how long should new birds be kept apart before they join the flock?" was answered "at least 10 days". That comes
from the DAHD biosecurity rule on storing materials, drugs and vaccines before use. The rule for new birds is
**at least 21 days** (TNAU biosecurity page). Failed question: `quarantine`.

## Why it happens (likely)

Both passages talk about "quarantine". The reranker and the model see only 650 characters of each passage
(`SHOWN_CHARS` in `backend/services/rag/index.js`), chosen by `focusPassage` around the sentences that match the
question. The DAHD passage's matching sentence is about materials, and it ranks first.

## What to do

1. Check what the model saw: the report in `backend/.data/eval-*.txt` lists the sources of each answer.
2. If the TNAU passage was not in the context, look at why it ranked lower (keyword and embedding ranks), and whether
   the synonyms in `backend/services/rag/text.js` (`QUERY_SYNONYMS`) should map "kept apart" or "new birds" to
   "quarantine" and "isolation".
3. If it was in the context, the prompt can ask the model to prefer the passage that is about birds over one about
   materials; or the eval question can be made more specific.

## What was done (2026-10-23)

The DAHD passage with "at least 21 days" ranked first, but the 650 characters shown to the model stopped before that sentence. QUERY_SYNONYMS maps "apart" to separate and quarantine and "join" to mixing, and focusPassage prefers a sentence with a figure when the question asks how long, how many or when. The 21-day rule is in the DAHD rules, not the TNAU page.

## Done when

`npm run eval:assistant -- --only=quarantine,foot-dip,disinfectant` passes all three.
