# Poultry farm planner: research

This note gathers the rules, norms and figures the poultry version of the planner needs, collected on 2026-10-19. It plays the part MIDH and the NHB cost norms play for the polyhouse planner.

Each figure names its source. Figures marked **verify** came from a secondary site or an old model project. They must be checked against the official document before they go into `backend/data`.

## 1. The poultry counterpart of MIDH

Polyhouses have one main scheme: MIDH, with NHB above 4,000 m². Poultry has no single scheme like it. Support is split across several:

| Polyhouse today | Poultry counterpart | What it gives |
|---|---|---|
| MIDH / NHM, 50% of the cost norm | **NLM-EDP** (National Livestock Mission, Entrepreneurship Development Programme), DAHD | 50% back-ended capital subsidy, capped at Rs 25 lakh. It covers only a rural poultry parent farm, hatchery and brooder-mother unit, not a plain broiler or layer farm |
| NHB, large projects | **AHIDF** (Animal Husbandry Infrastructure Development Fund) | 3% interest subvention and a loan of up to 90% of cost. It covers feed plants and meat processing, **not farms** |
| NHB / MIDH cost norms per m² | **NABARD unit costs** (per state regional office, yearly) | Unit cost of a 250 to 5,000-bird broiler or layer unit, and the Rs/sq ft and Rs/bird behind it |
| State top-ups | **State livestock schemes** (for example Maharashtra's MahaDBT schemes) | 50% general and 75% SC/ST subsidy on fixed-cost poultry units |
| Bank loan step | NABARD model bank projects | 10 to 25% margin, 12 to 12.5% interest, 5 to 9 years to repay |

The subsidy engine therefore can't be one table of slabs. It has to check which schemes a project qualifies for. For an ordinary commercial broiler or layer farm, the honest answer is often a state scheme plus a plain bank loan, with no central capital subsidy.

### 1.1 NLM-EDP (rural poultry)

Source: the KLDB NLM-EDP guideline, 2021-26, revised August 2024 (`livestock.kerala.gov.in/wp-content/uploads/2024/07/KLDB-NLM-GUIDELINE.pdf`). The national operational guidelines of January 2025 (`dahd.gov.in/.../NLMGuidelinesJan2025.pdf`) returned 403 to the fetcher and need a manual download (**verify**).

- **Unit:**
  - A parent farm of **1,000 female and 100 male birds** of Low Input Technology breeds.
  - A hatchery.
  - A brooder-mother unit.
  - "In this scheme, there is provision for Layer Farms only."
- **Subsidy:** 50% back-ended capital subsidy, at most **Rs 25 lakh**.
  - It is paid in **two instalments through SIDBI**.
  - The first comes after the bank has disbursed at least 25% of the loan and the SIA has verified it.
  - The second comes after completion. In total it may not exceed 50% of the actual capital cost.
- **Eligible applicants:** individuals, FPOs, SHGs, JLGs and Section 8 companies.
- **Applicant's share:** at least **10%** of the project cost for a bank-financed project.
- **Required:**
  - Training or experience certified by a government veterinarian.
  - Land, owned or on a registered lease.
  - A DPR.
  - Six months of bank statements, PAN, and a GIS-tagged photo of the site.
- **Other conditions:**
  - **Green-field projects only.** Expansions and upgrades are not supported.
  - The project must run for **at least 3 years** after completion.
  - No subsidy covers working capital, land, land lease or personal vehicles.
- **Where to apply:** the portal at `nlm.udyamimitra.in`.

Other NLM-EDP units, kept for a later multi-species version:
- Goats: 100+5 up to 500+25 animals, Rs 10 to 50 lakh.
- Pigs: 50+5 for Rs 15 lakh, 100+10 for Rs 30 lakh.
- Feed and fodder: up to Rs 50 lakh.

### 1.2 AHIDF

Source: the AHIDF guidelines (`gadvasu.in/assests/uploads/images/Guidelines AHIDF.pdf`).

- **Eligible applicants:** FPOs, private companies, individual entrepreneurs, Section 8 companies and MSMEs.
- **Eligible activities:** dairy processing, meat processing (poultry included) and animal feed plants. **Poultry farms themselves are not listed.**
- **Loan:** up to **90%** of cost. The applicant puts in 10% for micro and small units, 15% for medium and 25% for others.
- **Support:** **3%** interest subvention, and a credit guarantee for MSME projects.
- **Repayment:** **8 years** at most, including **2 years of moratorium**.

**What this means for the app:** AHIDF is shown only when the project includes a feed mill or a processing plant (a later add-on). For a plain farm, the app says it does not apply.

### 1.3 NABARD unit costs: the cost norms

Source: NABARD Unit Cost 2023-24, Jharkhand Regional Office (`nabard.org/auth/writereaddata/tender/pub_091023092112779.pdf`). Each NABARD regional office publishes its own, so these are Jharkhand's figures.

| Unit | Size | Unit cost (Rs) | Repayment (years) |
|---|---|---|---|
| Commercial broiler, deep litter, all-in-all-out | 1,000 birds | 5,94,000 | 5 |
| Commercial broiler | 500 birds | 3,00,000 | 5 |
| Commercial broiler | 250 birds | 1,52,000 | 5 |
| Commercial layer, cages (1+1+3) | 1,000 birds | 6,42,000 | 5 |
| Commercial layer, cages | 2,000 birds | 12,84,000 | 5 |
| Commercial layer, cages | 5,000 birds | 32,10,000 | 5 |
| Duck unit, semi-intensive | 100 F + 15 M | 1,05,000 | 5 |

The gestation period is 6 months to 1 year for all of them.

**Broiler, 500 birds, cost breakdown:**
- Shed: 600 sq ft @ Rs 319/sq ft = 1,91,400.
- Equipment: Rs 45/bird.
- Electrical work: 3% of the civil cost.
- Chicks: 525 @ Rs 35, allowing 5% mortality.
- Bird insurance: 6% of the chick cost.
- Feed: Rs 30/kg.
- Vaccines and medicines: Rs 32/bird.

**Layer, 5,000 birds, cost breakdown:**
- Shed: 1 sq ft/bird @ Rs 275/sq ft = 13,75,000.
- Feed store, 100 sq ft: 27,500.
- Fencing: 12,000.
- Electrical work: 3% of civil cost.
- Borewell, tank and pipes: 90,000.
- Cages and equipment: Rs 170/bird.
- Chicks: 5,250 @ Rs 35.
- Feed: Rs 30/kg × 3.2 kg/bird.
- Insurance: 6%.
- Medicines: Rs 25/bird.
- Labour: Rs 12,000/month for 1.5 months.

**NABARD terms that become checks in the app:**
- A new farm should be **1 km** from existing farms.
- A tie-up with a reputed hatchery.
- A monthly veterinary check.
- A vaccination schedule.
- Disinfection between flocks.
- For layers, a firm egg marketing arrangement.

### 1.4 NABARD model bank projects: techno-economics

**Broiler, 10,000 birds** (TNAU/NABARD model, `agritech.tnau.ac.in/banking/nabard_pdf/Animal husbandry/3.Poultry_Broiler_Farming.pdf`; the prices are old, **verify**):
- Floor space: **1 sq ft/bird**. Shed: Rs 150/sq ft. Equipment: Rs 25/bird.
- Production:
  - Feed: **3.3 kg/bird**.
  - Live weight: **1.7 kg**.
  - Rearing: **6 weeks**, then **2 weeks** of cleaning, giving **7 batches a year** (6 in year 1).
  - Birds bought per batch: 10,500 for 10,000 sold.
- Prices in the model:
  - Chick: Rs 22.
  - Feed: Rs 20/kg.
  - Live bird: Rs 70/kg.
  - Manure: Rs 0.5/bird.
- Loan terms:
  - Margin: 25%.
  - Interest: 12.5%.
  - Repayment: 6 to 8 years.
- Results: IRR 51.9%, BCR 1.05 at 15% discount.

**Layer, 20,000 birds, 2 batches, cages** (`agritech.tnau.ac.in/banking/nabard_pdf/Animal husbandry/4.Poultry_Layer.pdf`; the prices are old, **verify**):
- Housing:
  - Brooder-cum-grower house: 1 sq ft/bird on deep litter.
  - Layer house: **0.85 sq ft/bird** in cages.
  - Shed: Rs 200/sq ft.
  - Cages: Rs 50/bird. Grower equipment: Rs 20/bird.
- Feed:
  - **8.5 kg/bird** up to 20 weeks.
  - **40 kg/bird** over 52 weeks of laying.
- Flock:
  - **310 eggs/bird** over 52 laying weeks.
  - 10,500 bought → 10,000 reach laying → 9,000 culled.
  - Culled bird: Rs 60.
- Manure:
  - 0.2 kg/bird/week while growing, 0.5 kg/bird/week while laying.
  - Sold at Rs 300/t.
- Prices in the model: egg Rs 3.15, chick Rs 25.
- Loan terms: margin 25%, interest 12.5%, 7 to 9 years to repay with a 1-year grace.

**Improved desi birds, 100 birds** (NABARD, `nabard.org/.../Model-_Indigenous_Poultry_Farming_English.pdf`):
- Breeds: Vanaraja, Giriraja, Gramapriya, Kalinga Brown, Kaveri.
- Housing: 1 sq ft/bird in a mud, bamboo and thatch shed at Rs 5,000 per 100 sq ft. The floor is at least 2 ft above ground.
- Production:
  - **55 to 60 days to 1 kg**.
  - Mortality: 8 to 10%.
  - Feed: 2.5 kg/bird.
- Costs: chick Rs 25, feed Rs 25/kg, vaccines Rs 15/bird.
- Loan: 10% margin, 12% interest, 5 years with no moratorium.

## 2. Housing standards (in place of the polyhouse structure rules)

Sources:
- **IS 2732:1985**, Code of practice for poultry housing, reaffirmed 2023. The full text needs a BIS purchase or download (**verify** the exact clauses).
- The TNAU expert system on poultry house construction.
- The vikaspedia and ICAR housing pages.

**Site and layout:**
- The long axis runs **east-west**.
- At least **50 to 100 ft** between chick and grower sheds, and **100 m** between grower and layer sheds.

**Open-sided house:**
- Width **22 to 25 ft** (6.7 to 7.6 m).
- Eaves **6 to 7 ft** (1.8 to 2.1 m), centre **10 to 12 ft** (3 to 3.7 m).
- Roof overhang at least **3.5 ft** (1.07 m).

**Environment-controlled house:** width **40 ft or more** (12 m+).

**Construction:**
- Foundation 1 to 1.5 ft below and 1 to 1.5 ft above ground.
- Floor extends 1.5 ft outside the walls.
- Side wall **1 to 1.5 ft** high, then wire mesh above.

**Floor space:**

| Bird and system | Space |
|---|---|
| Broiler, deep litter | **1 sq ft** |
| Layer, deep litter | **2 sq ft** |
| Layer, cage | **0.46 sq ft** (4 birds in an 18" × 15" cage). The NABARD layer house uses 0.85 sq ft of shed floor per bird |
| Egg-type chicks, by age | 0.60 sq ft (0-8 weeks), 1.25 (9-18 weeks), 1.50 (>18 weeks) |
| Meat-type chicks, by age | 0.30 sq ft (0-4 weeks), 0.75 (4-8 weeks) |
| Environment-controlled broiler house | **0.5 to 0.7 sq ft**; studies test 0.6 to 1.0 |

**Feeders and lighting:**
- Layers: 5" of feeder per bird, or 6 ft of linear feeder per 30 birds, or 4 to 5 round 18" feeders per 100 birds.
- Lights hung 7 to 8 ft high, 10 ft apart for incandescent and 15 ft for tube lights.

**Climate and litter targets:**
- Temperature **22 to 30 °C**; humidity **30 to 60%**.
- Ammonia **< 25 ppm**; air speed 10 to 30 m/min.
- Litter **3 to 5 in** at the start, building up to 8 to 12 in.
- Broiler breeders are comfortable at 21 to 29 °C.

**Environment-controlled sheds:**
- Tunnel ventilation with cooling pads. Example: a 280 × 42 × 8.5 ft house needs 612 sq ft of pad, 10 fans of 21,500 CFM and 600 ft/min of air.
- Indicative cost Rs 800 to 1,200/sq ft (secondary source, **verify**).

## 3. Siting, pollution and registration rules (new; polyhouses had none)

**CPCB Environmental Guidelines for Poultry Farms**, enforced through NGT orders (2020 and 2021):
- **Consent:**
  - Farms above **5,000 birds** need consent under the Air and Water Acts.
  - The siting rules apply to these farms from **1.1.2023**.
- **Siting for new farms:**
  - **500 m** from residential zones.
  - **100 m** from rivers, lakes, canals and drinking-water sources.
  - **100 m** from national highways and **50 m** from state highways.
  - **10 to 15 m** from village roads.
  - Sheds at least **10 m** from the farm boundary.

**DAHD:**
- In April 2025 DAHD made **registration of all poultry farms with the state animal husbandry department mandatory**. This came with stricter biosecurity rules for avian influenza.
- DAHD's general biosecurity guidelines cover:
  - farm access control
  - quarantine of new birds
  - cleaning and disinfection
  - disposal of dead birds and manure

**NABARD:** at least 1 km from existing farms (section 1.3).

In the app these become a **site and compliance checklist**, the counterpart of today's subsidy checklist.

## 4. Market prices (in place of crop mandi prices)

- **Agmarknet / data.gov.in** (the feed the app already ingests) publishes daily prices for **344 commodities**. Its commodity list includes egg and poultry or hen entries (**verify** the exact commodity names in the feed before mapping, as was done for `Cucumbar(Kheera)`).
- **NECC** (National Egg Coordination Committee) publishes the reference **daily egg rate for 35+ centres**. It has **no official API**, so scraping needs a terms-of-use check. The fallback is a manual monthly CSV snapshot.
- **Broiler farm-gate rates** come mostly from integrators and trade sites. There is no official open feed. The app should treat the broiler price as user input with a published range.

## 5. Climate (reusing the district climate data)

- **Heat stress is the main climate risk for poultry.** Broilers lose feed intake and die in heat.
- A temperature-humidity index (THI) uses weights of 0.85 for broilers and 0.6 for layers. A THI above 30 means severe stress.
- The app's district hottest-month means (NASA POWER) and humidity can drive:
  - the advice to choose an environment-controlled shed, foggers or a cooling pad
  - a mortality allowance in summer batches
- Heavy rain calls for a wider roof overhang, a raised plinth and drainage. This is the existing rain advisory.

## 6. Production model

Indian farms work in two ways, and the planner should support both:

1. **Independent farm:** the farmer buys chicks, feed and medicines and sells birds or eggs at market prices. This is the NABARD model above.
2. **Contract (integrator) farming:** common in Tamil Nadu, Karnataka, Maharashtra, Andhra Pradesh, West Bengal and Gujarat.
   - The integrator supplies chicks, feed and medicines and buys every bird after 5 to 6 weeks.
   - The farmer invests only in the shed and equipment and is paid a **growing charge per kg of live weight**, adjusted for FCR and mortality.
   - Market price risk is much lower, but the number of batches a year depends on the integrator.

## 7. What still needs collecting before the data files are written

- [ ] NLM operational guidelines, January 2025: the official copy (manual download).
- [ ] The full text of IS 2732:1985 from BIS.
- [ ] NABARD unit costs for the user's main states, starting with Maharashtra. Every regional office publishes its own; use one per state if possible, else Jharkhand with a note.
- [ ] Agmarknet commodity names for egg and broiler or hen.
- [ ] Current prices for chicks, feed, eggs and broilers (2026). The model-project prices above are from older years.
- [ ] Maharashtra's state livestock scheme (MahaDBT): the official GR. The figures found so far (50%/75%, 3,000 to 5,000 meat birds, Rs 11.35 lakh, launched March 2026) come from `govtschemes.in`, a third-party site, so **verify** them.
- [ ] Livestock or poultry insurance premium norms (NLM risk management component).
- [ ] The CPCB guideline PDF itself (the figures above come from the NGT orders and summaries).

## Sources

- [NLM-EDP guideline, KLDB, 2021-26 (Aug 2024)](https://livestock.kerala.gov.in/wp-content/uploads/2024/07/KLDB-NLM-GUIDELINE.pdf)
- [NLM Comprehensive Operational Guidelines, Jan 2025 (DAHD)](https://dahd.gov.in/sites/default/files/2026-04/NLMGuidelinesJan2025.pdf)
- [AHIDF Guidelines](https://www.gadvasu.in/assests/uploads/images/Guidelines%20AHIDF.pdf)
- [NABARD Unit Cost 2023-24, Jharkhand RO](https://www.nabard.org/auth/writereaddata/tender/pub_091023092112779.pdf)
- [NABARD model: Poultry Broiler Farming (via TNAU)](https://agritech.tnau.ac.in/banking/nabard_pdf/Animal%20husbandry/3.Poultry_Broiler_Farming.pdf)
- [NABARD model: Poultry Layer (via TNAU)](https://agritech.tnau.ac.in/banking/nabard_pdf/Animal%20husbandry/4.Poultry_Layer.pdf)
- [NABARD model: Indigenous Poultry Farming](https://www.nabard.org/auth/writereaddata/ModelBankProject/0604183125Model-_Indigenous_Poultry_Farming_English.pdf)
- [TNAU expert system: Poultry house construction](https://agritech.tnau.ac.in/expert_system/poultry/Poultry%20House%20Construction.html)
- [Vikaspedia: Housing for layers](https://vikaspedia.in/agriculture/poultry/breeds-of-poultry/housing-for-layers)
- [BIS IS 2732:1985 (reaffirmed)](https://services.bis.gov.in/tmp/SR2732.pdf)
- [CPCB Environmental guidelines for poultry farms (India Environment Portal)](https://indiaenvironmentportal.org.in/reports-and-documents/environmental-guidelines-for-poultry-farms-2)
- [NGT order on poultry farms, 10/12/2021](https://indiaenvironmentportal.org.in/in-court/order-of-the-national-green-tribunal-regarding-unregulated-operation-of-poultry-farms-india-10122021)
- [Mandatory poultry farm registration, 2025 (Sentinel Assam)](https://www.sentinelassam.com/more-news/national-news/bird-flu-centre-makes-registration-of-poultry-farms-mandatory)
- [DAHD biosecurity guidelines (WATTPoultry)](https://www.wattagnet.com/articles/24343-india-updates-poultry-disease-prevention-advice)
- [Maharashtra livestock entrepreneurship scheme (third-party summary)](https://www.govtschemes.in/node/139909)
- [Environment-controlled broiler housing, ICAR IJAnS](https://epubs.icar.org.in/index.php/IJAnS/article/download/59955/24712/150146)
- [Heat stress and THI in poultry (Frontiers)](https://www.frontiersin.org/articles/10.3389/fvets.2020.568093/full)
- [data.gov.in: daily mandi prices](https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi)
- [NECC (Wikipedia)](https://en.wikipedia.org/wiki/National_Egg_Coordination_Committee)
