/* POLYHOUSE VALIDATOR - rules live in configValidator.js */

const { createConfigValidator } = require("./configValidator");

const validatePolyhouseConfig = createConfigValidator({ typeField: "polyhouseType", typeLabel: "Polyhouse" });

module.exports = { validatePolyhouseConfig };
