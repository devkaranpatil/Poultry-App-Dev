const express = require("express");
const router = express.Router();
const { success } = require("../utils/response");

// Same source the frontend bundles and the validator checks against.
const INDIA_LOCATIONS = require("../../shared/india-locations.json");

/**
 * GET /api/location/states-districts
 */
router.get("/states-districts", (req, res) => {
  return success(res, { data: INDIA_LOCATIONS }, 200, req);
});

module.exports = router;
