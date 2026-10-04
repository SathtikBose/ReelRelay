const express = require("express");
const { YtReplyLog } = require("../../../models/YtReplyLog");
const credentialService = require("../../../services/youtube/credentialService");
const quotaService = require("../../../services/youtube/quotaService");
const { env } = require("../../../config/env");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");

const router = express.Router();

// GET /admin/youtube/settings — YouTube Platform Settings
router.get("/", async (req, res, next) => {
  try {
    const [ytStatus, quotaStatus, totalLogs] = await Promise.all([
      credentialService.getStatus(),
      quotaService.getQuotaStatus(),
      YtReplyLog.countDocuments({}),
    ]);

    const csrfToken = generateToken(req, res);

    return res.render("youtube/settings/index", {
      ytStatus,
      quotaStatus,
      totalLogs,
      config: {
        enabled: env.YT_ENABLED,
        pollEnabled: env.YT_POLL_ENABLED,
        baseIntervalSec: env.YT_POLL_BASE_INTERVAL_SEC || 300,
        maxRepliesPerHour: env.YT_MAX_REPLIES_PER_HOUR || 60,
        replyDelayMinMs: env.YT_REPLY_DELAY_MIN_MS || 1000,
        replyDelayMaxMs: env.YT_REPLY_DELAY_MAX_MS || 3000,
        dailyQuotaBudget: env.YT_DAILY_QUOTA_LIMIT || 10000,
      },
      csrfToken,
      title: "YouTube Settings — ReelRelay",
      platform: "youtube",
      section: "settings",
      activeNav: "settings",
    });
  } catch (err) {
    logger.error({ err }, "Error rendering YouTube settings page");
    return next(err);
  }
});

// POST /admin/youtube/settings/purge-logs — Purge non-deferred logs
router.post("/purge-logs", async (req, res) => {
  try {
    const retention = (req.body.retention || "all").trim();
    const query = { status: { $ne: "deferred" } };

    if (retention !== "all") {
      const days = parseInt(retention, 10);
      if (!isNaN(days) && days > 0) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        query.createdAt = { $lt: cutoff };
      }
    }

    const result = await YtReplyLog.deleteMany(query);
    logger.info({ deletedCount: result.deletedCount, retention }, "Purged YouTube reply logs");

    req.session.flash = {
      type: "success",
      message: `Purged ${result.deletedCount} log entries from database.`,
    };
  } catch (err) {
    logger.error({ err }, "Error purging YouTube logs");
    req.session.flash = {
      type: "error",
      message: `Failed to purge logs: ${err.message}`,
    };
  }

  return res.redirect("/admin/youtube/settings");
});

module.exports = router;
