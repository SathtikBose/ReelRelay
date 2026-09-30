const express = require("express");
const mongoose = require("mongoose");
const tokenService = require("../../services/tokenService");
const { env } = require("../../config/env");
const { generateToken } = require("../../middleware/csrf");
const { logger } = require("../../lib/logger");
const packageJson = require("../../../package.json");

const router = express.Router();

/**
 * Formats uptime into a readable string
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

// GET /admin/settings — Settings page
router.get("/", async (req, res, next) => {
  try {
    const tokenStatus = await tokenService.getTokenStatus();
    const csrfToken = generateToken(req, res);

    const dbStateMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    const dbStatus = dbStateMap[mongoose.connection.readyState] || "unknown";

    // Build verify token hint (last 4 characters only)
    const tokenLen = env.IG_VERIFY_TOKEN ? env.IG_VERIFY_TOKEN.length : 0;
    const verifyTokenHint = tokenLen > 4
      ? `••••••••${env.IG_VERIFY_TOKEN.slice(-4)}`
      : "••••";

    const callbackUrl = `${env.BASE_URL.replace(/\/+$/, "")}/webhook`;

    return res.render("settings/index", {
      tokenStatus,
      webhook: {
        callbackUrl,
        verifyTokenHint,
      },
      appInfo: {
        version: packageJson.version || "1.0.0",
        uptime: formatUptime(process.uptime()),
        nodeVersion: process.version,
        dbStatus,
        environment: env.NODE_ENV,
      },
      csrfToken,
      title: "Settings — ReelRelay",
      activeNav: "settings",
    });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/settings/refresh-token — Manual token refresh
router.post("/refresh-token", async (req, res) => {
  try {
    const result = await tokenService.manualRefresh();
    logger.info("Manual token refresh executed successfully");
    const days = result.expires_in ? Math.floor(result.expires_in / (24 * 3600)) : 60;
    req.session.flash = {
      type: "success",
      message: `Token refreshed successfully! Valid for ${days} days.`,
    };
  } catch (err) {
    logger.error({ err }, "Manual token refresh failed");
    await tokenService.recordRefreshFailure(err.message);
    req.session.flash = {
      type: "error",
      message: `Token refresh failed: ${err.message}`,
    };
  }
  return res.redirect("/admin/settings");
});

// POST /admin/settings/replace-token — Replace access token
router.post("/replace-token", async (req, res) => {
  const { token } = req.body || {};

  if (!token || typeof token !== "string" || !token.trim()) {
    req.session.flash = {
      type: "error",
      message: "Please enter a valid Instagram Access Token.",
    };
    return res.redirect("/admin/settings");
  }

  try {
    await tokenService.replaceToken(token.trim());
    logger.info("Instagram access token replaced manually by admin");
    req.session.flash = {
      type: "success",
      message: "New Instagram access token encrypted and saved successfully.",
    };
  } catch (err) {
    logger.error({ err }, "Error replacing token");
    req.session.flash = {
      type: "error",
      message: `Failed to save new token: ${err.message}`,
    };
  }
  return res.redirect("/admin/settings");
});

module.exports = router;
