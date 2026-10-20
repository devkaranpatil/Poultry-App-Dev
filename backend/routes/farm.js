// The farm calculation: POST /api/farm/calculate. Public: it reads no account data. The body is the shed setup and
// the user's planning assumptions; every figure comes back from the poultry calculator (services/poultry).

const express = require("express");
const { success, failure } = require("../utils/response");
const { firstIssue, poultryCalculateRequest } = require("../validators/requestSchemas");
const { runPoultryCalculation, normalizePoultryConfig } = require("../services/poultry/calculator");
const { buildReference } = require("../services/referenceData");

const router = express.Router();

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

router.post("/calculate", async (req, res) => {
  const parsed = poultryCalculateRequest.safeParse(req.body ?? {});
  if (!parsed.success) return failure(res, firstIssue(parsed.error), 400, undefined, req);
  const { config: input, assumptions, bankFinanced } = parsed.data;
  try {
    const calculation = runPoultryCalculation(input, assumptions, { bankFinanced });
    if (calculation.errors) return failure(res, "Validation failed", 400, { errors: calculation.errors }, req);
    const data = calculation.result;
    // Official context (the district's monthly climate). Never affects the figures above.
    data.reference = await buildReference(calculation.config);
    return success(res, { data }, 200, req);
  } catch (err) {
    console.error("Farm calculation error:", err);
    return failure(res, "Failed to calculate the farm", 500, undefined, req);
  }
});

module.exports = router;
// Used by the AI routes, which must ground their output in server-computed numbers.
module.exports.runCalculation = runPoultryCalculation;
module.exports.normalizeConfig = normalizePoultryConfig;
