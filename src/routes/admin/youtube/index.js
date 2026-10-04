const express = require("express");
const oauthRoutes = require("./oauth");
const videoRoutes = require("./videos");
const credentialService = require("../../../services/youtube/credentialService");
const quotaService = require("../../../services/youtube/quotaService");
const pickerService = require("../../../services/youtube/pickerService");
const { YtVideoRule } = require("../../../models/YtVideoRule");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");

const router = express.Router();

// Mount OAuth flow routes
router.use("/oauth", oauthRoutes);

// Mount Video Rules CRUD routes
router.use("/videos", videoRoutes);

// GET /admin/youtube/api/videos — JSON Picker API
router.get("/api/videos", async (req, res) => {
  try {
    const pageToken = req.query.after || req.query.pageToken || "";
    const refresh = req.query.refresh === "true";

    const result = await pickerService.getVideosList({ pageToken, refresh });

    return res.json({
      data: result.items,
      paging: {
        cursors: {
          after: result.nextPageToken,
          before: result.prevPageToken,
        },
      },
      total: result.totalResults,
      cached: result.cached,
    });
  } catch (err) {
    logger.error({ err }, "Error fetching YouTube videos for picker API");
    return res.status(err.statusCode || 502).json({
      error: {
        code: err.code || "YOUTUBE_API_ERROR",
        message: err.message || "Failed to fetch YouTube videos",
      },
    });
  }
});

// GET /admin/youtube — YouTube Dashboard
router.get("/", async (req, res, next) => {
  try {
    const ytStatus = await credentialService.getStatus();
    const quotaStatus = await quotaService.getQuotaStatus();
    const activeRulesCount = await YtVideoRule.countDocuments({ active: true });
    const totalRulesCount = await YtVideoRule.countDocuments({});
    const csrfToken = generateToken(req, res);

    return res.render("youtube/index", {
      ytStatus,
      quotaStatus,
      activeRulesCount,
      totalRulesCount,
      csrfToken,
      title: "YouTube Dashboard — ReelRelay",
      platform: "youtube",
      section: "dashboard",
      activeNav: "dashboard",
    });
  } catch (err) {
    logger.error({ err }, "Error rendering YouTube dashboard");
    return next(err);
  }
});

// POST /admin/youtube/disconnect — Disconnect channel and revoke tokens
router.post("/disconnect", async (req, res) => {
  try {
    await credentialService.disconnect();
    req.session.flash = {
      type: "success",
      message: "YouTube channel disconnected successfully.",
    };
  } catch (err) {
    logger.error({ err }, "Error disconnecting YouTube channel");
    req.session.flash = {
      type: "error",
      message: `Failed to disconnect YouTube channel: ${err.message}`,
    };
  }
  return res.redirect("/admin/youtube");
});

module.exports = router;
