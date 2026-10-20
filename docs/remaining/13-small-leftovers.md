# 13. Small leftovers from the polyhouse

**Status:** open. None of these affects the app.

- **`backend/studio`**, the developer "API Studio" page served at `/studio`, still animates a polyhouse beside the API
  and the database. It is not part of the app. Redraw it as a shed (the shapes in
  `src/components/farm/scene/shedLayout.ts` can guide it) or remove it and its two lines in `backend/app.js`.
- **`src/components/farm/scene/sceneMaterials.ts`** keeps the polyhouse's water-motion modes (`fall`, `spray`, `mist`,
  `flow`). Only `sway` is used now, by the landscape's trees and grass (`SceneAmbience.tsx`). Remove the unused modes.
- **The polyhouse tables** (`cost_norms`, `midh_area_limits`, `mandi_prices_daily`) stay in the shared database and
  its migrations, because the polyhouse app uses them. This app no longer reads or loads them. Leave them unless the
  polyhouse app moves to its own database.

## Done when

`backend/studio` shows a shed or is gone, `sceneMaterials.ts` has only the modes in use, and `npm test`, `npm run lint`
and the e2e scene tests still pass.
