const express = require("express");
const { success } = require("../utils/response");
const { getDbStatus } = require("../config/db");
const pkg = require("../package.json");

const router = express.Router();
const bootTime = Date.now();

router.get("/", (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - bootTime) / 1000);
  return success(
    res,
    {
      status: "healthy",
      service: "greenhouse-backend",
      uptimeSeconds,
      nodeVersion: process.version,
      env: process.env.NODE_ENV || "development",
      version: pkg.version,
      database: getDbStatus(),
    },
    200,
    req
  );
});

module.exports = router;
