const express = require("express");
const packageJson = require("../../package.json");

const router = express.Router();

/**
 * GET /health
 * Public health check endpoint for uptime monitors
 */
router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    db: "unknown",
    version: packageJson.version || "1.0.0",
  });
});

module.exports = router;
