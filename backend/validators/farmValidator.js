/* GREENHOUSE VALIDATOR - rules live in configValidator.js */

const { createConfigValidator } = require("./configValidator");

const validateFarmConfig = createConfigValidator({ typeField: "greenhouseType", typeLabel: "Greenhouse" });

module.exports = { validateFarmConfig };
