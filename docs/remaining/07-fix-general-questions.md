# 07. General questions answered from the project

**Status:** open. Found by the evaluation on 2026-10-20 (task 01).

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

## Done when

`npm run eval:assistant -- --only=shed-heights,shed-width,space-broiler,project-area,project-birds` passes all five.
