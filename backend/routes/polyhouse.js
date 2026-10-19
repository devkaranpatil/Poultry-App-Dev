const { validatePolyhouseConfig } = require("../validators/polyhouseValidator");
const { createCalculator } = require("../services/calculator");
const { createCalculatorRouter } = require("./calculatorRouter");
const { getClimateData, getClimateFactor } = require("../services/costModel");

const calculator = createCalculator({ typeField: "polyhouseType", validate: validatePolyhouseConfig });
const router = createCalculatorRouter({ kind: "polyhouse", calculator });

module.exports = router;
module.exports.runCalculation = calculator.runCalculation;
module.exports.__testables = {
  normalizeAndSanitizeConfig: calculator.normalizeAndSanitizeConfig,
  buildCalculationResult: calculator.buildCalculationResult,
  getClimateData,
  getClimateFactor,
};
