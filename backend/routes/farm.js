const { validateFarmConfig } = require("../validators/farmValidator");
const { createCalculator } = require("../services/calculator");
const { createCalculatorRouter } = require("./calculatorRouter");
const { getClimateData, getClimateFactor } = require("../services/costModel");

const calculator = createCalculator({ typeField: "greenhouseType", validate: validateFarmConfig });
const router = createCalculatorRouter({ kind: "farm", calculator });

module.exports = router;
// Used by the AI routes, which must ground their output in server-computed numbers.
module.exports.runCalculation = calculator.runCalculation;
module.exports.__testables = {
  normalizeAndSanitizeConfig: calculator.normalizeAndSanitizeConfig,
  buildCalculationResult: calculator.buildCalculationResult,
  getClimateData,
  getClimateFactor,
};
