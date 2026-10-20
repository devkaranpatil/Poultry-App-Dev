// The climate of a state and district: the state profile (backend/data/stateClimate.js), with the district's own
// hottest month (NASA POWER) and rainfall (IMD normals) where they are known. No database, so every caller gets
// the same answer.

const STATE_CLIMATE = require("../data/stateClimate");
const CLIMATE_PROFILES = require("../data/climateProfiles.json");
const RAINFALL_PROFILES = require("../data/rainfallProfiles.json");

const DEFAULT_CLIMATE = {
  zone: "General",
  group: "Composite",
  temp: 28,
  humidity: 60,
  rainfall: 1200,
};

function getClimateData(stateName, district) {
  const state = STATE_CLIMATE[stateName] || DEFAULT_CLIMATE;
  // The district's own hottest month when NASA has it, else the state's average hottest month, else unknown.
  const districtHeat = CLIMATE_PROFILES.districts[`${stateName}|${district}`];
  // IMD district rainfall normals when imported (see datasets/README.md), else the state's typed approximation.
  const districtRain = RAINFALL_PROFILES.districts[`${stateName}|${district}`];
  return {
    ...state,
    rainfall: districtRain ? districtRain.annualMm : state.rainfall,
    rainfallSource: districtRain ? "district" : "state",
    hottestMonthMeanC: districtHeat ? districtHeat.hottestMonthMeanC : (state.hottestMonthMeanC ?? null),
  };
}

module.exports = { DEFAULT_CLIMATE, getClimateData };
