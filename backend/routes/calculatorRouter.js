// Route factory for /api/farm. `kind` names the config endpoint (/farm-config) and the messages;
// the calculator carries the structure-type field name and its validator.

const express = require("express");
const { success, failure } = require("../utils/response");
const { getClimateData, getClimateFactor } = require("../services/costModel");
const phase25Climate = require("../services/climatePhase25");
const { deriveCrops, toSuggestionText } = require("../services/cropAdvisor");
const { buildReference } = require("../services/referenceData");

/**
 * @param {{ kind: string, calculator: ReturnType<typeof import("../services/calculator").createCalculator> }} options
 */
function createCalculatorRouter({ kind, calculator }) {
  const router = express.Router();
  const { typeField, validate, normalizeAndSanitizeConfig, buildCalculationResult } = calculator;
  const label = kind[0].toUpperCase() + kind.slice(1);

  /** Normalises and validates the body; sends the 400 itself and returns null when invalid. */
  const getValidatedConfig = (input, req, res) => {
    const config = normalizeAndSanitizeConfig(input);
    const errors = validate(config);
    if (Object.keys(errors).length > 0) {
      failure(res, "Validation failed", 400, { errors }, req);
      return null;
    }
    return config;
  };

  /** Wraps a handler with config validation and a uniform 500 for unexpected failures. */
  const withConfig = (failureMessage, pickInput, handler) => async (req, res) => {
    try {
      const config = getValidatedConfig(pickInput(req), req, res);
      if (!config) return undefined;
      return await handler(config, req, res);
    } catch (err) {
      console.error(`${failureMessage}:`, err);
      return failure(res, failureMessage, 500, undefined, req);
    }
  };

  router.post("/calculate-area", (req, res) => {
    const { length, width } = req.body ?? {};
    const l = Number(length);
    const w = Number(width);
    const present = length !== undefined && width !== undefined && length !== "" && width !== "";
    if (!present || !Number.isFinite(l) || !Number.isFinite(w) || l <= 0 || w <= 0) {
      return failure(res, "Length and width must be positive numbers", 400, undefined, req);
    }
    return success(res, { area: Number((l * w).toFixed(2)) }, 200, req);
  });

  router.post(`/${kind}-config`, (req, res) => {
    const config = getValidatedConfig(req.body, req, res);
    if (!config) return undefined;

    const area = Number(config.length) * Number(config.width);
    const climateData = getClimateData(config.stateName, config.district);
    const climateGroup = climateData.group;

    return success(
      res,
      {
        message: `${label} configuration validated successfully`,
        data: {
          dimensions: { length: Number(config.length), width: Number(config.width), area: Number(area.toFixed(2)) },
          heights: { gutterHeight: Number(config.gutterHeight), ridgeHeight: Number(config.ridgeHeight) },
          structure: {
            [typeField]: config[typeField],
            roofType: config.roofType,
            structureMaterial: config.structureMaterial,
            coverMaterial: config.coverMaterial,
          },
          ventilation: { sideVentilation: config.sideVentilation, doorType: config.doorType },
          cultivation: { selectedCrop: config.selectedCrop, irrigationSystem: config.irrigationSystem },
          location: { stateName: config.stateName, district: config.district, climateGroup },
          climate: {
            zone: climateData.zone,
            factor: getClimateFactor(climateData),
            profile: {
              avgTemperature: climateData.temp,
              humidity: climateData.humidity,
              rainfall: climateData.rainfall,
            },
            intelligence: phase25Climate(climateGroup),
          },
        },
      },
      200,
      req
    );
  });

  router.post(
    "/calculate",
    withConfig(`Failed to calculate ${kind} results`, (req) => req.body, async (config, req, res) => {
      const data = buildCalculationResult(config);
      // Official context (government cost norm, area limit, district climate). Never affects the numbers above.
      data.reference = await buildReference(config, data, typeField);
      return success(res, { data }, 200, req);
    })
  );

  router.post(
    "/estimate-cost",
    withConfig("Failed to estimate cost", (req) => req.body, (config, req, res) => {
      const data = buildCalculationResult(config);
      return success(
        res,
        {
          cost: {
            baseCost: { totalCost: data.diagnostics.subtotal },
            climateFactor: data.climate.climateFactor,
            finalCost: data.cost.totalCost,
          },
        },
        200,
        req
      );
    })
  );

  router.post(
    "/crop-suggestions",
    withConfig("Failed to generate crop suggestions", (req) => req.body?.config || req.body || {}, (config, req, res) => {
      const climateGroup = getClimateData(config.stateName).group;
      const crops = deriveCrops(climateGroup, config.selectedCrop, config.irrigationSystem);
      return success(res, { climateGroup, crops, suggestions: toSuggestionText(crops, climateGroup) }, 200, req);
    })
  );

  return router;
}

module.exports = { createCalculatorRouter };
