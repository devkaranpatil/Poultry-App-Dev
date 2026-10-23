# 07. General questions answered from the project

**Status:** fixed in code on 2026-10-23; to confirm with the eval questions under "Done when" (the rerun of task 01).

## The fault

"What should the eaves height and the centre height of an open poultry shed be?" was answered with this project's own
heights (2.1 m and 3.5 m) instead of the guide's ranges (6 to 7 ft at the eaves, 10 to 12 ft at the centre, TNAU
housing). Failed question: `shed-heights`.

## Why it happens

The system message carries the PROJECT FACTS, and the model treats every question as being about the project.

## What to do

Add one rule to the instructions in `backend/routes/ai.js` (the "Rules:" list): a general question ("what should a
shed be", "how much space does a broiler need") is answered from the SOURCES first, and may add how the user's project
compares; a question about "my shed", "my farm" or "my project" is answered from the PROJECT FACTS.

The system message must stay identical for a project so the runtime can reuse its cache (see the assistant-findings
memory): change the rule text once, not per question.

## What was done (2026-10-23)

Rule 1 of the instructions in backend/routes/ai.js now says a general question is answered from the SOURCES first, and a question about my shed, farm, flock or project from the PROJECT FACTS. The text is fixed, so the system message stays the same for a project.

## Done when

`npm run eval:assistant -- --only=shed-heights,shed-width,space-broiler,project-area,project-birds` passes all five.
