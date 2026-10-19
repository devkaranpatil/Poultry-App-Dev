// Monte Carlo risk for one setup: POST /api/risk/simulate. Public like the calculator: it reads no account data.

const express = require("express");
const { runCalculation } = require("./greenhouse");
const { createRateLimiter } = require("../middleware/rateLimit");
const { success, failure } = require("../utils/response");
const { firstIssue, riskRequest } = require("../validators/requestSchemas");
const { simulateRisk, yieldRangeFrom } = require("../services/risk/monteCarlo");
const { loadPriceSpread } = require("../services/risk/priceSpread");

const router = express.Router();

// A run takes about 50 ms for 5,000 trials; the limit stops a script from using the server as a calculator farm.
const riskRateLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: Number(process.env.RISK_RATE_LIMIT_MAX || 120),
  keyGenerator: (req) => `risk:${req.ip}`,
  message: "Too many simulations for now. Please try again in a few minutes.",
});

router.post("/simulate", riskRateLimiter, async (req, res) => {
  const parsed = riskRequest.safeParse(req.body ?? {});
  if (!parsed.success) return failure(res, firstIssue(parsed.error), 400, undefined, req);
  const { config: input, assumptions, options } = parsed.data;

  const calculation = runCalculation(input);
  if (calculation.errors) return failure(res, "Validation failed", 400, { errors: calculation.errors }, req);
  const { config, result } = calculation;

  const crop = result.selectedCrop;
  const yieldRange = yieldRangeFrom(crop?.expectedYield);
  if (!yieldRange) return failure(res, "No yield range is known for this crop", 422, undefined, req);

  try {
    const price = await loadPriceSpread(config.selectedCrop);
    const subsidy = result.subsidy;
    const simulation = simulateRisk({
      areaSqm: result.area,
      capitalCostInr: result.cost.totalCost,
      subsidyOwnCostInr: subsidy ? subsidy.ownCostInr : result.cost.totalCost,
      scheme: subsidy ? { normCostInr: subsidy.normCostInr, capInr: subsidy.capInr } : null,
      ...assumptions,
      yieldRange,
      priceSigmaLog: price.sigmaLog,
      ...options,
    });

    return success(
      res,
      {
        simulation,
        // Where each range came from, so the page can say which parts are measured and which are assumed.
        sources: {
          yield: {
            range: crop.expectedYield,
            published: Boolean(crop.yieldSource),
            basis: crop.yieldSource?.basis ?? null,
            source: crop.yieldSource?.source ?? null,
            url: crop.yieldSource?.url ?? null,
          },
          price,
          buildCost: { low: result.cost.costRange.low, high: result.cost.costRange.high },
          subsidy: subsidy ? { scheme: subsidy.scheme, normPerSqmInr: subsidy.normPerSqmInr, capInr: subsidy.capInr } : null,
        },
      },
      200,
      req
    );
  } catch (err) {
    console.error("Risk simulation error:", err);
    return failure(res, "Failed to run the risk simulation", 500, undefined, req);
  }
});

module.exports = router;
