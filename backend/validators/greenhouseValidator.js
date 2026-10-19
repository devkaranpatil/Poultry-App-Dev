/* GREENHOUSE VALIDATOR - rules live in configValidator.js */

const { createConfigValidator } = require("./configValidator");

const validateGreenhouseConfig = createConfigValidator({ typeField: "greenhouseType", typeLabel: "Greenhouse" });

module.exports = { validateGreenhouseConfig };
