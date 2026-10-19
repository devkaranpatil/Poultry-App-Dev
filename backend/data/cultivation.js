// Crop, irrigation and climate-zone reference data for the advisory output.

const IRRIGATION_PROFILES = {
  drip: {
    label: "Drip Irrigation",
    notes: [
      "Best fit for row crops with strong water-use efficiency.",
      "Pairs well with mulching and soluble fertigation.",
    ],
  },
  sprinkler: {
    label: "Sprinkler Grid",
    notes: [
      "Balanced whole-bed coverage for mixed crop layouts.",
      "Useful where uniform canopy cooling matters more than water savings.",
    ],
  },
  fogger: {
    label: "Fogger + Mist",
    notes: [
      "Helps raise humidity for leafy crops and nursery phases.",
      "Needs airflow discipline to avoid fungal pressure in humid districts.",
    ],
  },
  "hydroponic-nft": {
    label: "Hydroponic NFT",
    notes: [
      "Premium recirculating system for high-turnover protected cultivation.",
      "Requires tighter nutrient, pump, and backup-power management.",
    ],
  },
};

const CROP_LIBRARY = {
  tomato: {
    name: "Tomato",
    expectedYield: "40-60 t/ha",
    season: "Year-round",
    notes: "Reliable protected-cultivation staple with strong market demand.",
    suitabilityByZone: { "Hot & Dry": "good", "Warm & Humid": "good", Temperate: "good", Cold: "moderate", Composite: "excellent" },
  },
  capsicum: {
    name: "Capsicum",
    expectedYield: "80-120 t/ha",
    season: "Oct-Mar",
    notes: "High-value greenhouse crop that rewards steady climate control.",
    suitabilityByZone: { "Hot & Dry": "excellent", "Warm & Humid": "good", Temperate: "excellent", Cold: "good", Composite: "excellent" },
  },
  cucumber: {
    name: "Cucumber",
    expectedYield: "200-300 t/ha",
    season: "Year-round",
    notes: "Fast-cycle crop with strong turnover when irrigation is kept consistent.",
    suitabilityByZone: { "Hot & Dry": "good", "Warm & Humid": "excellent", Temperate: "good", Cold: "moderate", Composite: "excellent" },
  },
  lettuce: {
    name: "Lettuce",
    expectedYield: "20-30 t/ha",
    season: "Cool months",
    notes: "Leafy crop that benefits from uniform moisture and heat moderation.",
    suitabilityByZone: { "Hot & Dry": "moderate", "Warm & Humid": "moderate", Temperate: "excellent", Cold: "excellent", Composite: "good" },
  },
  strawberry: {
    name: "Strawberry",
    expectedYield: "15-25 t/ha",
    season: "Oct-Feb",
    notes: "Premium crop for cooler windows with strong market upside.",
    suitabilityByZone: { "Hot & Dry": "moderate", "Warm & Humid": "moderate", Temperate: "excellent", Cold: "good", Composite: "good" },
  },
  gerbera: {
    name: "Gerbera",
    expectedYield: "250-350 stems/m2/year",
    season: "Year-round",
    notes: "Floriculture option suited to premium greenhouse operations.",
    suitabilityByZone: { "Hot & Dry": "good", "Warm & Humid": "excellent", Temperate: "good", Cold: "moderate", Composite: "good" },
  },
};

// [name, suitability, expectedYield, season, notes]
const CROPS_BY_CLIMATE_GROUP = {
  "Hot & Dry": [
    ["Capsicum", "excellent", "80-120 t/ha", "Oct-Mar", "Use evaporative cooling and mulching."],
    ["Cucumber", "good", "200-280 t/ha", "Year-round", "Maintain drip irrigation schedule."],
    ["Cherry Tomato", "good", "45-65 t/ha", "Year-round", "Control heat stress with shade percentage."],
    ["Melon", "moderate", "25-35 t/ha", "Summer", "Good returns with strict irrigation control."],
    ["Marigold", "good", "18-24 t/ha", "Winter", "Suitable as a lower-water floriculture option."],
  ],
  "Warm & Humid": [
    ["Cucumber", "excellent", "220-300 t/ha", "Year-round", "Ventilation is critical for disease control."],
    ["Tomato", "good", "40-60 t/ha", "Year-round", "Use fungal disease preventive program."],
    ["Chilli", "good", "18-28 t/ha", "Year-round", "Prefer raised beds for drainage."],
    ["Gerbera", "excellent", "250-350 stems/m2/year", "Year-round", "Strong market in humid zones."],
    ["Lettuce", "moderate", "18-25 t/ha", "Cool months", "Use shade and airflow in warm periods."],
  ],
  Temperate: [
    ["Capsicum", "excellent", "90-130 t/ha", "Apr-Oct", "Performs strongly with stable temperatures."],
    ["Strawberry", "excellent", "15-25 t/ha", "Oct-Feb", "High-value crop for cool climates."],
    ["Tomato", "good", "45-70 t/ha", "Year-round", "Maintain humidity balance during winter."],
    ["Lettuce", "excellent", "20-30 t/ha", "Year-round", "Very suitable for protected cultivation."],
    ["Carnation", "good", "180-260 stems/m2/year", "Year-round", "Good floriculture option for temperate zones."],
  ],
  Cold: [
    ["Capsicum", "good", "70-110 t/ha", "Spring-Autumn", "Ensure thermal buffering at night."],
    ["Lettuce", "excellent", "22-32 t/ha", "Year-round", "Low-temp tolerant in protected setup."],
    ["Broccoli", "good", "12-18 t/ha", "Cool months", "Strong winter performance."],
    ["Strawberry", "good", "14-24 t/ha", "Spring", "Premium produce in protected environments."],
    ["Carnation", "moderate", "160-230 stems/m2/year", "Year-round", "Needs winter energy management."],
  ],
  Composite: [
    ["Tomato", "excellent", "40-60 t/ha", "Year-round", "Stable returns in most districts."],
    ["Capsicum", "excellent", "80-120 t/ha", "Oct-Mar", "High-value protected crop."],
    ["Cucumber", "excellent", "200-300 t/ha", "Year-round", "Fast cycle and high turnover."],
    ["Strawberry", "good", "15-25 t/ha", "Oct-Feb", "Premium seasonal option."],
    ["Gerbera", "good", "250-350 stems/m2/year", "Year-round", "Favorable for diversified revenue."],
  ],
};

// Yields that come from published trials (datasets/csv/crop_yields_published.csv, rows marked "measured").
// They replace the yield text above for these crops in every climate group, so a number the app shows is
// either one of these or explicitly unverified. The trials were run in mid-hill Meghalaya (vegetables) and
// Junagadh, Gujarat (gerbera); other regions will differ. Suitability ratings and seasons remain the app's own.
const PUBLISHED_YIELDS = {
  Tomato: {
    expectedYield: "45-84 t/ha",
    basis: "Measured per crop in low-cost naturally ventilated polyhouses, mid-hill Meghalaya (7 genotypes, 2 seasons)",
    source: "Verma, Jha and Baiswar (2018), Indian Journal of Horticulture 75(4)",
    url: "https://journal.iahs.org.in/index.php/ijh/article/download/400/1399",
    note: "Reported potential under full crop management: 250-300 t/ha over an 8-9 month crop (Indian Farming, 2025).",
  },
  Capsicum: {
    expectedYield: "36-60 t/ha",
    basis: "Measured per crop in low-cost naturally ventilated polyhouses, mid-hill Meghalaya (4 varieties, 2 seasons)",
    source: "Verma, Jha and Baiswar (2018), Indian Journal of Horticulture 75(4)",
    url: "https://journal.iahs.org.in/index.php/ijh/article/download/400/1399",
    note: "Reported potential under full crop management: 80-100 t/ha over a 9-12 month crop (Indian Farming, 2025).",
  },
  Cucumber: {
    expectedYield: "17-33 t/ha",
    basis: "Measured per crop in low-cost naturally ventilated polyhouses, mid-hill Meghalaya (landraces and open-pollinated varieties)",
    source: "Verma, Jha and Baiswar (2018), Indian Journal of Horticulture 75(4)",
    url: "https://journal.iahs.org.in/index.php/ijh/article/download/400/1399",
    note: "Parthenocarpic hybrids are reported at 40-50 t/ha per 3-3.5 month crop (Indian Farming, 2025).",
  },
  Gerbera: {
    expectedYield: "132-396 stems/m2/year",
    basis: "Measured per year in a naturally ventilated polyhouse at Junagadh, Gujarat (11 cultivars)",
    source: "Ahlawat, Barad and Jat (2012), Indian Journal of Horticulture 69(4)",
    url: "https://journal.iahs.org.in/index.php/ijh/article/download/2052/718",
    note: "The 11 cultivars averaged 226 stems/m2/year (median 204); the range is wide because cultivars differ a lot.",
  },
};

for (const profile of Object.values(CROP_LIBRARY)) {
  if (PUBLISHED_YIELDS[profile.name]) profile.expectedYield = PUBLISHED_YIELDS[profile.name].expectedYield;
}
for (const rows of Object.values(CROPS_BY_CLIMATE_GROUP)) {
  for (const row of rows) {
    if (PUBLISHED_YIELDS[row[0]]) row[2] = PUBLISHED_YIELDS[row[0]].expectedYield;
  }
}

module.exports = { IRRIGATION_PROFILES, CROP_LIBRARY, CROPS_BY_CLIMATE_GROUP, PUBLISHED_YIELDS };
