// Siting and registration rules for a poultry farm (CPCB guidelines as enforced by the NGT, NABARD's
// lending terms and DAHD's 2025 registration directive). The same rows are in
// datasets/csv/poultry_siting_rules.csv; a test keeps them equal.

const CPCB = {
  document: "CPCB Environmental Guidelines for Poultry Farms, enforced by NGT orders of 2020 and 2021",
  url: "https://indiaenvironmentportal.org.in/reports-and-documents/environmental-guidelines-for-poultry-farms-2",
};

/** The CPCB rules and the consent requirement apply to farms above this many birds. */
const CPCB_THRESHOLD_BIRDS = 5000;

const SITING_RULES = [
  { id: "residential", description: "Distance from residential zones (odour and flies)", distanceM: 500, appliesAboveBirds: CPCB_THRESHOLD_BIRDS, appliesTo: "new farms", source: CPCB },
  { id: "water-bodies", description: "Distance from rivers, lakes, canals and drinking-water sources", distanceM: 100, appliesAboveBirds: CPCB_THRESHOLD_BIRDS, appliesTo: "new farms", source: CPCB },
  { id: "national-highway", description: "Distance from national highways", distanceM: 100, appliesAboveBirds: CPCB_THRESHOLD_BIRDS, appliesTo: "new farms", source: CPCB },
  { id: "state-highway", description: "Distance from state highways", distanceM: 50, appliesAboveBirds: CPCB_THRESHOLD_BIRDS, appliesTo: "new farms", source: CPCB },
  {
    id: "village-road",
    description: "Distance from rural roads, internal roads and village paths (the guideline gives 10 to 15 m; the larger is used)",
    distanceM: 15,
    appliesAboveBirds: CPCB_THRESHOLD_BIRDS,
    appliesTo: "new farms",
    source: CPCB,
  },
  { id: "boundary", description: "Sheds from the farm boundary (cross ventilation and odour dispersion)", distanceM: 10, appliesAboveBirds: CPCB_THRESHOLD_BIRDS, appliesTo: "new farms", source: CPCB },
  {
    id: "pollution-consent",
    description: "Consent to establish and operate under the Air and Water Acts from the State Pollution Control Board",
    distanceM: null,
    appliesAboveBirds: CPCB_THRESHOLD_BIRDS,
    appliesTo: "all farms",
    source: {
      document: "NGT order, 2020 (consent for farms above 5,000 birds from 01.01.2021)",
      url: "https://indiaenvironmentportal.org.in/in-court/order-of-the-national-green-tribunal-regarding-unregulated-operation-of-poultry-farms-india-10122021",
    },
  },
  {
    id: "existing-farms",
    description: "Distance from existing poultry farms or complexes",
    distanceM: 1000,
    appliesAboveBirds: 0,
    appliesTo: "bank-financed farms",
    source: { document: "NABARD Unit Cost 2023-24 (terms and conditions for poultry)", url: "https://www.nabard.org/auth/writereaddata/tender/pub_091023092112779.pdf" },
  },
  {
    id: "registration",
    description: "Registration with the state animal husbandry department",
    distanceM: null,
    appliesAboveBirds: 0,
    appliesTo: "all farms",
    source: {
      document: "DAHD directive, April 2025 (mandatory registration of poultry farms)",
      url: "https://www.sentinelassam.com/more-news/national-news/bird-flu-centre-makes-registration-of-poultry-farms-mandatory",
    },
  },
];

/**
 * The rules that apply to a farm of this size. "Above 5,000 birds" is strict: a 5,000-bird farm is not covered.
 * @param {number} flockSize
 * @param {{ bankFinanced?: boolean }} [options]  NABARD's 1 km rule binds only bank-financed farms
 */
function sitingRulesFor(flockSize, { bankFinanced = true } = {}) {
  const birds = Math.max(0, Number(flockSize) || 0);
  if (birds === 0) return [];
  return SITING_RULES.filter((rule) => birds > rule.appliesAboveBirds).filter((rule) => bankFinanced || rule.appliesTo !== "bank-financed farms");
}

module.exports = { CPCB_THRESHOLD_BIRDS, SITING_RULES, sitingRulesFor };
