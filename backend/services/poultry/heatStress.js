// Heat stress for poultry from the district climate (NASA POWER monthly means, backend/data/climateProfiles.json).
// Heat is the main climate risk for birds: they eat less and die in hot, humid weather. The temperature-humidity
// index weights dry-bulb against wet-bulb temperature, 0.85/0.15 for broilers and 0.6/0.4 for layers, and a THI
// above 30 is severe stress (shared/poultry-norms.json, source "nasa-thi").
//
// The months use 24-hour means, so afternoons are hotter than the index says: a month flagged here is certainly
// stressful, and a month just below the line can still have hot afternoons.

const CLIMATE_PROFILES = require("../../data/climateProfiles.json");

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const SEVERE_THI = 30;
const THI_WEIGHTS = { meat: 0.85, eggs: 0.6 };

/** Wet-bulb temperature from air temperature (C) and relative humidity (%), Stull (2011). */
function wetBulbC(tempC, rhPct) {
  const t = Number(tempC);
  const rh = Number(rhPct);
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
    4.686035
  );
}

/** THI = w * dry bulb + (1 - w) * wet bulb, where w is 0.85 for meat birds and 0.6 for layers. */
function thi(tempC, rhPct, product = "meat") {
  const w = THI_WEIGHTS[product] ?? THI_WEIGHTS.meat;
  return w * Number(tempC) + (1 - w) * wetBulbC(tempC, rhPct);
}

/** The district's monthly means, else the state's, else null. */
function monthlyClimate(stateName, district) {
  const entry = CLIMATE_PROFILES.districts[`${stateName}|${district}`];
  if (entry?.monthlyMeanC) return { basis: "district", monthlyMeanC: entry.monthlyMeanC, monthlyRhPct: entry.monthlyRhPct };
  const state = CLIMATE_PROFILES.states[stateName];
  if (state?.monthlyMeanC) return { basis: "state", monthlyMeanC: state.monthlyMeanC, monthlyRhPct: state.monthlyRhPct };
  return null;
}

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * @param {{ stateName: string, district?: string, product: "meat"|"eggs", housingSystem: string }} input
 * @returns {null | { basis, threshold, thiByMonth: Array<{ month, thi }>, severeMonths: string[], advice: string[] }}
 */
function assessHeatStress({ stateName, district, product, housingSystem }) {
  const climate = monthlyClimate(stateName, district);
  if (!climate) return null;
  const thiByMonth = MONTHS.map((month, i) => ({ month, thi: round1(thi(climate.monthlyMeanC[i], climate.monthlyRhPct[i], product)) }));
  const severeMonths = thiByMonth.filter((m) => m.thi > SEVERE_THI).map((m) => m.month);
  const advice = [];
  if (severeMonths.length > 0) {
    if (housingSystem === "environment-controlled") {
      advice.push("Your tunnel fans and cooling pads carry the hot months; plan a generator so they never stop.");
    } else {
      advice.push(
        `${severeMonths.length} month(s) of severe heat stress (${severeMonths.join(", ")}): fit foggers or roof sprinklers, and consider an environment-controlled shed.`
      );
      if (product === "meat") advice.push("Place fewer birds or sell lighter in the hottest months: mortality rises in summer batches.");
    }
    advice.push("Keep cool drinking water, and feed in the cooler hours of the day.");
  }
  return { basis: climate.basis, threshold: SEVERE_THI, thiByMonth, severeMonths, advice };
}

module.exports = { MONTHS, SEVERE_THI, wetBulbC, thi, monthlyClimate, assessHeatStress };
