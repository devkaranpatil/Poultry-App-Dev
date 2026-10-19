const getSeason = (month) => {
  if (month >= 3 && month <= 5) return "summer";
  if (month >= 6 && month <= 9) return "monsoon";
  return "normal";
};

const phase25Climate = (climateZone) => {
  const month = new Date().getMonth() + 1;
  const season = getSeason(month);

  const result = {
    season,
    warnings: [],
    ventilationMultiplier: 1,
  };

  if (climateZone === "Warm & Humid" && season === "summer") {
    result.warnings.push(
      "High humidity and heat expected. Enhanced ventilation recommended."
    );
    result.ventilationMultiplier = 1.3;
  }

  if (climateZone === "Hot & Dry" && season === "summer") {
    result.warnings.push(
      "Extreme heat load expected. Increase ridge height and vent area."
    );
    result.ventilationMultiplier = 1.4;
  }

  return result;
};

module.exports = phase25Climate;
