// The poultry calculation: POST /api/poultry/calculate. Public like the farm calculator: it reads no account data.
// Phase 4 moves the screens onto it and retires the polyhouse /api/farm.

const express = require("express");
const { success, failure } = require("../utils/response");
const { firstIssue, poultryCalculateRequest } = require("../validators/requestSchemas");
const { runPoultryCalculation } = require("../services/poultry/calculator");

const router = express.Router();

router.post("/calculate", (req, res) => {
  const parsed = poultryCalculateRequest.safeParse(req.body ?? {});
  if (!parsed.success) return failure(res, firstIssue(parsed.error), 400, undefined, req);
  const { config, assumptions, bankFinanced } = parsed.data;
  try {
    const calculation = runPoultryCalculation(config, assumptions, { bankFinanced });
    if (calculation.errors) return failure(res, "Validation failed", 400, { errors: calculation.errors }, req);
    return success(res, { data: calculation.result }, 200, req);
  } catch (err) {
    console.error("Poultry calculation error:", err);
    return failure(res, "Failed to calculate the poultry farm", 500, undefined, req);
  }
});

module.exports = router;
module.exports.runPoultryCalculation = runPoultryCalculation;
