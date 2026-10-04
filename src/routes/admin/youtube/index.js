const express = require("express");
const oauthRoutes = require("./oauth");
const videoRoutes = require("./videos");
const activityRoutes = require("./activity");
const settingsRoutes = require("./settings");
const credentialService = require("../../../services/youtube/credentialService");
const pickerService = require("../../../services/youtube/pickerService");
const statsService = require("../../../services/youtube/statsService");
const scheduler = require("../../../services/youtube/scheduler");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");

const router = express.Router();

// Mount OAuth flow routes
router.use("/oauth", oauthRoutes);

// Mount Video Rules CRUD routes
router.use("/videos", videoRoutes);

// Mount Activity routes
router.use("/activity", activityRoutes);

// Mount Settings routes
router.use("/settings", settingsRoutes);

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
    const dashboardData = await statsService.getYtDashboardData();
    const csrfToken = generateToken(req, res);

    return res.render("youtube/index", {
      ytStatus: dashboardData.ytStatus,
      quotaStatus: dashboardData.quotaStatus,
      stats: dashboardData.stats,
      alerts: dashboardData.alerts,
      recentActivity: dashboardData.recentActivity,
      lastPoll: dashboardData.lastPoll,
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

// POST /admin/youtube/poll-now — Trigger immediate manual poll cycle
router.post("/poll-now", async (req, res) => {
  try {
    const pollResult = await scheduler.pollNow();

    if (pollResult.skipped) {
      req.session.flash = {
        type: "info",
        message: `Polling cycle skipped: ${pollResult.reason || "Poller locked or disabled"}`,
      };
    } else if (pollResult.status === "ok") {
      const { rules = 0, comments = 0, replies = 0 } = pollResult.summary || {};
      req.session.flash = {
        type: "success",
        message: `Poll completed! Checked ${rules} rule(s), scanned ${comments} comment(s), posted ${replies} automated reply(ies).`,
      };
    } else {
      req.session.flash = {
        type: "error",
        message: `Poll cycle encountered errors: ${pollResult.error || "Unknown error"}`,
      };
    }
  } catch (err) {
    logger.error({ err }, "Error running manual YouTube poll-now");
    req.session.flash = {
      type: "error",
      message: `Failed to execute poll: ${err.message}`,
    };
  }

  return res.redirect("/admin/youtube");
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
