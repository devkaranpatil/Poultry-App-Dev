# Poultry farm planner: feature changes

This document lists every feature of the polyhouse planner and what happens to it in the poultry version. Each one is marked **keep**, **rename**, **rework** or **new**. The figures come from [research.md](research.md).

The rule of thumb: the *machinery* stays and the *domain* changes. The 3D editor, sidebar, step journey, loan maths, Monte Carlo engine, report export, local AI with retrieval, auth, saved setups and i18n are all reused. Their content becomes poultry content.

## 1. The setup: from greenhouse config to shed config

`GreenhouseConfig` (`src/types/greenhouse.ts`) becomes `FarmConfig` (`src/types/farm.ts`). Field by field:

| Today | Poultry version | Options (first is the default) | Why |
|---|---|---|---|
| `length`, `width` (m) | **keep** `length`, `width` | Width 6 to 12 m for open-sided houses and up to 18 m for controlled ones. Length 10 to 150 m | IS 2732 / TNAU: 22 to 25 ft for open houses, 40 ft or more for controlled ones |
| `gutterHeight` | **rename** `eavesHeight` | 1.8 to 3.5 m, default 2.1 | 6 to 7 ft eaves |
| `ridgeHeight` | **keep** `ridgeHeight` | 3 to 6 m, default 3.5 | 10 to 12 ft centre |
| `greenhouseType` | **rework** `housingSystem` | `open-sided` (deep litter, natural air), `environment-controlled` (tunnel fans and cooling pads), `backyard` (low-cost, desi birds) | The three NABARD and EC models |
| `roofType` `flat/gable/gothic` | **rework** `roofType` | `gable`, `monitor` (raised ridge vent, common in Indian sheds), `lean-to` | Poultry sheds have no arched roofs; `monitor` replaces `gothic` |
| `structureMaterial` | **rework** `frameMaterial` | `steel-truss` (GI/MS, pre-engineered), `rcc-pillars` (RCC posts with a steel truss), `bamboo-wood` | NABARD sheds versus backyard sheds |
| `coverMaterial` | **rework** `roofSheet` | `gi-sheet`, `galvalume`, `fibre-cement`, `puf-panel` (insulated, for controlled sheds), `thatch` | Roof sheeting is what changes the cost and the heat load |
| `sideVentilation` | **rework** `sideWalls` | `mesh-curtain` (low wall, wire mesh and manual curtains), `mesh-auto-curtain`, `closed-tunnel` (solid wall, tunnel fans and cooling pad; required for controlled sheds) | Open versus controlled sheds |
| `doorEntry` | **rework** `entry` | `single-door`, `door-footbath` (door with a disinfectant footbath), `anteroom` (changing room and footbath) | DAHD biosecurity |
| `selectedCrop` | **rework** `birdType` | `broiler`, `layer-cage`, `layer-floor`, `coloured-broiler` (Kaveri/Gramapriya type), `desi` (Vanaraja/Giriraja/Kadaknath) | NABARD broiler, layer and indigenous models |
| `irrigationSystem` | **rework** `feedingSystem` | `manual` (round feeders and bell drinkers), `semi-auto` (pan feeders and nipple drinkers), `automatic` (chain or pan lines and nipple lines). Layer cages: `trough` | Equipment cost per bird |
| (none) | **new** `stockingDensity` | sq ft per bird, defaulting from bird type and housing: broiler 1.0, controlled broiler 0.7, layer floor 2.0, layer cage 0.85, desi 1.0 | It decides the flock size |
| (none) | **new** `cageTiers` (layers in cages) | `2`, `3`, `4` | Cage type (1+1+3 and so on) |
| (none) | **new** `farmingModel` | `independent`, `contract` | Integrator farming changes the money side completely |
| (none) | **derived** `flockSize` | `floor area / stockingDensity`, multiplied by tiers for cages, rounded down | Shown everywhere; the user can also type a flock size and the shed resizes |
| `state`, `district` | **keep** | | Climate, schemes and siting |

`shared/greenhouse-limits.json` becomes `shared/farm-limits.json` with the new ranges. Saved polyhouse setups can't be converted: there is no meaningful mapping from a tomato house to a broiler shed (see the decision in [README.md](README.md)).

## 2. Workspace steps (`src/components/workspace/steps.ts`)

| Step | Change | What it shows |
|---|---|---|
| `design` | **rework** | The 3D shed with the sidebar. Tabs: Size, Housing, Roof, Frame, Roof sheet, Side walls, Entry, Birds, Feeding, Location. Flock size is shown live in the toolbar |
| `site` | **rework** into "Site and rules" | Climate as today, plus heat-stress days and advice (controlled shed, foggers). **New:** a siting checklist with CPCB distances (500 m from homes, 100 m from water, 100/50 m from highways, 10 to 15 m from village roads, 10 m from the boundary), the consent rule above 5,000 birds, mandatory farm registration, and NABARD's 1 km from other farms. The user ticks what is true; any item left unticked becomes a warning in the report |
| `cost` | **rework** | Capital cost: shed civil work, roof, side walls and curtains, equipment, electrical work (3% of civil), water (borewell, tank, pipes), feed store, fencing, and the controlled-shed kit. Working capital for the first batch: chicks, feed, vaccines, labour. Compared with the NABARD unit cost for the same flock size |
| `earnings` | **rework** | Broiler: batches a year, birds sold, kg sold, revenue, feed cost, chick cost, margin per bird and per kg. Layer: eggs a year, culled birds, manure. Contract mode: growing charge × kg. Market rates from Agmarknet or NECC where available |
| `loan` | **keep** the maths, **rework** the defaults | Margin 10 to 25%, 12.5% interest, 5 to 8 years, moratorium. Subsidy is back-ended (NLM pays after completion), so the loan amount ignores it until it is paid |
| `risk` | **rework** the inputs | Monte Carlo over mortality, FCR, sale price, feed price and an outbreak shock (a lost batch) |
| `summary` | **keep** | Optional AI summary, rewritten for poultry |
| `report` | **rework** | A DPR-style report in the order NABARD and NLM ask for (section 5.2 of the NABARD model: technical, financial, managerial), with the compliance checklist |

## 3. Subsidy and schemes (the MIDH counterpart)

`backend/data/subsidySchemes.js` becomes `backend/data/poultrySchemes.js`. It keeps today's design: pure data and arithmetic, sources travelling with the result, and a CSV in `datasets/csv` that a test keeps equal to the code.

`computeSchemeSubsidy` becomes `computeSchemes(project)`, which returns **a list of schemes with an eligibility verdict for each**, not one scheme:

| Scheme | Eligible when | Assistance | Notes shown to the user |
|---|---|---|---|
| NLM-EDP Rural Poultry | Low Input Technology parent farm of at least 1,000 F + 100 M, with a hatchery and brooder-mother unit; green-field; owned or leased land | 50% of the capital cost, capped at Rs 25 lakh; no working capital or land | Back-ended; 2 instalments through SIDBI; at least 10% own contribution; run for 3 years |
| State scheme (per state table) | Per state. Maharashtra is first, once the GR is verified | 50% general, 75% SC/ST, up to the published unit cost | Selection by lottery on MahaDBT; land and training rules |
| AHIDF | Only with a feed plant or processing unit (not in v1) | 3% interest subvention, loan up to 90%, 8 years with 2 of moratorium | "Does not cover the farm itself" |
| None | A plain commercial broiler or layer farm in a state without a scheme | Bank loan only | The app says so plainly, and does not invent a subsidy |

A **new field**, `beneficiaryCategory` (`general`, `sc-st`, `women`), is asked on the cost step because state schemes depend on it.

The NABARD unit costs act as the **cost norm**: recognised cost = min(own cost, NABARD unit cost scaled to the flock). The engine works the same way as `normCostInr` today.

## 4. Cost model (`backend/services/costModel.js`, `backend/data/pricing.js`)

| Today | Poultry version |
|---|---|
| Rates per m² of floor: structure, cover, ventilation, irrigation, foundation, labour, misc | Rates **per sq ft of shed** (civil, roof sheet, side walls and curtains) plus **per bird** (equipment by feeding system, cages by tiers) plus fixed items (feed store, fencing, borewell and tank, generator) |
| Envelope factor (roof shape) | **Keep**: roof sheet area from the roof shape and overhang (1.07 m), side wall area from the low wall height |
| Climate surcharge (+5% heavy rain, +3% hot) | **Rework**: heavy rain → plinth and drainage; hot → curtains, foggers or a controlled-shed kit suggested, not just a percentage |
| `isClimateControlled` electrical cost | Controlled-shed kit: tunnel fans, cooling pad, controller, generator. Priced per bird, from secondary sources at first and marked **verify** |
| Cost range ±10% | **Keep** |

Starting rates (NABARD Jharkhand 2023-24):
- Broiler shed Rs 319/sq ft, layer shed Rs 275/sq ft.
- Broiler equipment Rs 45/bird, layer cages Rs 170/bird.
- Electrical work 3% of civil cost.
- Fencing Rs 12,000. Borewell, tank and pipes Rs 90,000 (5,000-bird layer unit).

## 5. Production and returns (`src/lib/finance.ts`, `backend/services/returns.js`)

These two must stay equal, as today; a test keeps them in step.

**Broiler, independent:**
- Batches a year = 365 / (rearing days + cleaning days). Defaults are 42 + 14 days, about 6.5 a year; NABARD uses 7.
- Birds sold = placed × (1 − mortality). Mortality defaults to 5%.
- Live weight sold = birds sold × weight. Weight defaults to 2.0 kg (NABARD used 1.7).
- Feed = live weight × FCR. FCR defaults to 1.7 (verify against current breed data).
- Revenue = kg × broiler price + manure + gunny bags.
- Costs:
  - chicks × price
  - feed kg × feed price
  - vaccines, medicines and labour per bird
  - litter
  - power
  - bird insurance

**Broiler, contract:**
- Revenue = kg × growing charge (Rs/kg, set by the user, with an FCR and mortality incentive band).
- Costs: power, litter, labour and shed upkeep only. The integrator supplies chicks, feed and medicines.

**Layer:**
- Two phases:
  - Brooding and growing: 0 to 20 weeks, 8.5 kg of feed.
  - Laying: 52 weeks, 40 kg of feed, 310 eggs.
- Batches overlap: NABARD's flock chart runs 2 batches a year.
- Revenue = eggs × egg price + culled birds × price + manure (0.5 kg/bird/week).

**Desi or coloured broiler:** like a broiler, but 55 to 60 days to 1 kg, 8 to 10% mortality and 2.5 kg of feed.

Every parameter shows its source and can be changed in "Change assumptions". This is the existing `assumptions` pattern.

## 6. Risk (`backend/services/risk/monteCarlo.js`)

- **Keep:** the seeded generator, triangular draws and histogram.
- **Replace** the yield and price ranges with:
  - mortality (triangular, for example 3/5/12%)
  - FCR (1.55/1.7/1.9)
  - sale price (from the spread of Agmarknet or NECC history; until then a ± band marked as an assumption)
  - feed price (± band)
- **New:** an **outbreak event**. With a small yearly probability, one batch is lost or culled. The probability is a user assumption with a clear label, because no official rate was found.

## 7. Market prices (`backend/services/marketPrices.js`, `src/lib/mandi.ts`)

- Map `broiler` and `coloured-broiler` → the Agmarknet poultry or hen commodity, and `layer-*` → the egg commodity, once the feed's names are verified.
- Eggs are priced per 100 eggs or per egg, not per quintal. `latestMandiPrice` gets a unit field.
- The NECC egg rate is optional: a monthly CSV snapshot in `datasets/csv` until the terms allow automatic fetching.

## 8. 3D model (`src/components/greenhouse/scene/*` → `src/components/farm/scene/*`)

**Keep:**
- the instancing helpers
- edit handles and the G/S keys
- selection outline, camera, view gizmo, transitions
- environments and skies
- quality levels

**Rework or new parts** (the part names are the sidebar tabs):

| Part | Model |
|---|---|
| Frame | Steel truss or RCC posts at about 3 m bays, a truss on each post, purlins. Bamboo posts for backyard sheds |
| Roof | Gable, monitor (a raised ridge with its own small roof and a vent gap) or lean-to. Corrugated sheets (GI/galvalume texture), fibre cement or thatch. Overhang 1.07 m |
| Side walls | A low brick wall 0.3 to 0.45 m high, wire mesh above, a curtain that rolls down by the selected amount. Controlled sheds: a solid wall, a cooling pad panel on one end and tunnel fans on the other |
| Entry | A door, a footbath tray, or an anteroom box |
| Birds | Instanced low-poly chickens. Broilers are white and stocky; layers are brown in cages; desi birds are coloured. A visual cap (like `plantCap`) shows a sample; the label gives the true count |
| Feeding | Round feeders and bell drinkers in a grid, or pan feeder and nipple lines hung from the truss, or troughs on cages |
| Cages | A-type stepped cages, 2 to 4 tiers, in rows with aisles |
| Litter | A light straw-textured floor for deep litter |
| Extras | Brooders (gas or electric hovers) for chicks; foggers; a feed store room; a generator; a water tank on a stand |

The design reference images should go into `docs/3d-model-references.md`, as for the polyhouse.

## 9. AI advisor and knowledge base (`backend/services/rag`, `datasets/knowledge`)

- **Keep:** the engine (local model only, as the memory note requires), retrieval, citation and the evaluation harness.
- **Replace** the knowledge manifest with poultry sources:
  - NLM-EDP guidelines
  - AHIDF guidelines
  - NABARD broiler, layer and indigenous model projects
  - NABARD unit costs
  - CPCB poultry guidelines
  - DAHD biosecurity guidelines
  - the TNAU poultry expert system (housing, feeding, vaccination schedule)
  - vikaspedia layer and broiler pages
- **Replace** the code-generated passages: bird library, feeding systems and pricing constants (corpus step 3).
- **Rewrite** `datasets/eval/assistant-questions.json`, about 60 to 90 poultry questions with the same categories: facts, what-if, project and edge.
- `whatIf.js`: the levers become flock size, bird type, housing system, contract versus independent, and prices.

## 10. Branding, routes and storage

| Item | Today | Poultry version |
|---|---|---|
| Product name | Greenhouse IQ (`index.html`, Landing, Logo) | **To be decided** (see the README) |
| API routes | `/api/greenhouse`, `/api/polyhouse`, `/api/calculator` | `/api/farm` (one route; the duplicate `/api/polyhouse` goes) |
| Folders | `src/components/greenhouse`, `useGreenhouseCalculations` | `src/components/farm`, `useFarmCalculations` |
| Types | `greenhouse.ts`, `polyhouse.ts` (duplicate) | `farm.ts` only |
| localStorage keys | `greenhouse.*` | `farm.*`; the old keys are cleared once on first load |
| DB | `saved_configurations` (JSON config), `cost_norms`, `midh_area_limits`, `mandi_prices_daily` | `saved_configurations` gets `domain = 'poultry'` and a schema version; `cost_norms` holds the NABARD rows; `midh_area_limits` → `scheme_rules`; `mandi_prices_daily` stays |
| i18n | about 3,270 lines, en/hi/mr | All greenhouse wording rewritten in the 3 languages (Hindi and Marathi poultry terms: कुक्कुटपालन, ब्रॉयलर, अंडी, शेड) |
| Landing page and guide | Polyhouse story | Poultry story, new hero images |

## 11. What is new and had no polyhouse counterpart

1. A **flock-size-first** start. "I want 5,000 broilers" sizes the shed from the stocking density.
2. The **siting and compliance checklist** (CPCB, registration, consent, NABARD 1 km).
3. **Contract versus independent** farming.
4. A **batch calendar**: placement, harvest and cleaning dates for the year, and for layers the flock chart from the NABARD model.
5. A **biosecurity checklist** in the report (footbath, anteroom, quarantine, disposal pit). It is drawn from DAHD's guidelines.
6. **Heat-stress advice** from district climate: how many months exceed the comfort band, and what that means for open versus controlled sheds.
