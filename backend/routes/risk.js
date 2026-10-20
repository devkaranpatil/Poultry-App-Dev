// Monte Carlo risk for one poultry setup: POST /api/risk/simulate. Public like the calculator: it reads no account
// data.

const express = require("express");
const { createRateLimiter } = require("../middleware/rateLimit");
const { success, failure } = require("../utils/response");
const { firstIssue, poultryRiskRequest } = require("../validators/requestSchemas");
const { runPoultryCalculation } = require("../services/poultry/calculator");
const { simulatePoultryRisk } = require("../services/risk/poultryRisk");

const router = express.Router();

// A run takes about 80 ms for 5,000 trials; the limit stops a script from using the server as a calculator farm.
const riskRateLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: Number(process.env.RISK_RATE_LIMIT_MAX || 120),
  keyGenerator: (req) => `risk:${req.ip}`,
  message: "Too many simulations for now. Please try again in a few minutes.",
});

// Mortality, feed conversion, sale and feed prices, build cost and an outbreak chance.
router.post("/simulate", riskRateLimiter, (req, res) => {
  const parsed = poultryRiskRequest.safeParse(req.body ?? {});
  if (!parsed.success) return failure(res, firstIssue(parsed.error), 400, undefined, req);
  const { config: input, assumptions, risk, options } = parsed.data;

  const calculation = runPoultryCalculation(input, assumptions);
  if (calculation.errors) return failure(res, "Validation failed", 400, { errors: calculation.errors }, req);
  const { config, result } = calculation;
  if (result.flock.birds === 0) return failure(res, "The shed holds no birds", 422, undefined, req);

  try {
    const simulation = simulatePoultryRisk({
      birdType: config.birdType,
      flockSize: result.flock.birds,
      projectCost: result.financedCost,
      assumptions: result.assumptions,
      ...risk,
      ...options,
    });
    return success(
      res,
      {
        simulation,
        sources: {
          buildCost: { low: result.cost.costRange.low, high: result.cost.costRange.high },
          // No poultry price history is stored (the mandi feed has no egg or poultry commodity): the spread is assumed.
          price: { basis: "assumption", sigmaLog: simulation.assumptions.salePriceSigmaLog },
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
