// backend/data/stateClimate.js
//
// Single source of per-state climate data for the farm calculation (climate card and heat stress).
// Covers every state offered in shared/india-locations.json.
//
//   zone      - descriptive climate label shown to the user
//   group     - NBC-style climate group used for crop suitability and
//               seasonal advisories ("Hot & Dry" | "Warm & Humid" |
//               "Composite" | "Temperate" | "Cold")
//   temp      - annual mean temperature (deg C), NASA POWER state mean
//   humidity  - annual mean relative humidity (%), NASA POWER state mean
//   rainfall  - approximate annual rainfall (mm), hand-typed
//   hottestMonthMeanC - mean temperature of the state's hottest month, NASA POWER (see bottom of file)
//
// Values are state-level; districts inside a state can differ (climateProfiles.json has the districts).

const HAND_TYPED = {
  "Andhra Pradesh": { zone: "Tropical", group: "Warm & Humid", temp: 28, humidity: 65, rainfall: 950 },
  "Arunachal Pradesh": { zone: "Subtropical Highland", group: "Temperate", temp: 20, humidity: 80, rainfall: 2800 },
  Assam: { zone: "Humid Subtropical", group: "Warm & Humid", temp: 25, humidity: 80, rainfall: 2800 },
  Bihar: { zone: "Subtropical", group: "Composite", temp: 26, humidity: 65, rainfall: 1200 },
  Chhattisgarh: { zone: "Tropical", group: "Composite", temp: 27, humidity: 60, rainfall: 1400 },
  Goa: { zone: "Tropical Coastal", group: "Warm & Humid", temp: 27, humidity: 78, rainfall: 2900 },
  Gujarat: { zone: "Arid", group: "Hot & Dry", temp: 30, humidity: 45, rainfall: 800 },
  Haryana: { zone: "Semi-Arid", group: "Composite", temp: 25, humidity: 55, rainfall: 600 },
  "Himachal Pradesh": { zone: "Temperate Highland", group: "Temperate", temp: 17, humidity: 60, rainfall: 1250 },
  Jharkhand: { zone: "Subtropical", group: "Composite", temp: 25, humidity: 65, rainfall: 1300 },
  Karnataka: { zone: "Tropical", group: "Composite", temp: 27, humidity: 62, rainfall: 1200 },
  Kerala: { zone: "Tropical Wet", group: "Warm & Humid", temp: 28, humidity: 80, rainfall: 3000 },
  "Madhya Pradesh": { zone: "Subtropical", group: "Composite", temp: 25, humidity: 55, rainfall: 1150 },
  Maharashtra: { zone: "Tropical", group: "Composite", temp: 29, humidity: 58, rainfall: 1100 },
  Manipur: { zone: "Subtropical Highland", group: "Temperate", temp: 21, humidity: 75, rainfall: 1500 },
  Meghalaya: { zone: "Subtropical Highland", group: "Temperate", temp: 20, humidity: 80, rainfall: 2800 },
  Mizoram: { zone: "Subtropical Highland", group: "Temperate", temp: 21, humidity: 78, rainfall: 2500 },
  Nagaland: { zone: "Subtropical Highland", group: "Temperate", temp: 20, humidity: 75, rainfall: 1900 },
  Odisha: { zone: "Tropical", group: "Warm & Humid", temp: 27, humidity: 72, rainfall: 1450 },
  Punjab: { zone: "Semi-Arid", group: "Composite", temp: 26, humidity: 50, rainfall: 650 },
  Rajasthan: { zone: "Arid", group: "Hot & Dry", temp: 32, humidity: 40, rainfall: 400 },
  Sikkim: { zone: "Temperate Highland", group: "Cold", temp: 15, humidity: 80, rainfall: 2700 },
  "Tamil Nadu": { zone: "Tropical", group: "Warm & Humid", temp: 29, humidity: 68, rainfall: 1000 },
  Telangana: { zone: "Tropical Semi-Arid", group: "Composite", temp: 28, humidity: 55, rainfall: 900 },
  Tripura: { zone: "Tropical", group: "Warm & Humid", temp: 25, humidity: 80, rainfall: 2200 },
  "Uttar Pradesh": { zone: "Subtropical", group: "Composite", temp: 28, humidity: 55, rainfall: 900 },
  Uttarakhand: { zone: "Temperate Highland", group: "Temperate", temp: 19, humidity: 65, rainfall: 1500 },
  "West Bengal": { zone: "Tropical", group: "Warm & Humid", temp: 28, humidity: 72, rainfall: 1800 },
};

// Temperature and humidity come from NASA POWER (mean of the state's districts, see
// datasets/scripts/build_climate_profiles.mjs). The hand-typed numbers above remain only for states
// NASA has no district data for (Arunachal Pradesh, Goa, Meghalaya). Rainfall stays hand-typed:
// NASA's precipitation under-reads in the hills (Sikkim 1,346 mm vs about 2,700 mm).
const NASA = require("./climateProfiles.json");

module.exports = Object.fromEntries(
  Object.entries(HAND_TYPED).map(([state, profile]) => {
    const nasa = NASA.states[state];
    return [
      state,
      {
        ...profile,
        temp: nasa ? nasa.annualMeanTempC : profile.temp,
        humidity: nasa ? nasa.annualHumidityPct : profile.humidity,
        // Mean temperature of the hottest month; null when NASA has no data for the state.
        hottestMonthMeanC: nasa ? nasa.hottestMonthMeanC : null,
      },
    ];
  })
);
