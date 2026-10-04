const express = require("express");
const { YtReplyLog } = require("../../../models/YtReplyLog");
const { YtVideoRule } = require("../../../models/YtVideoRule");
const pipeline = require("../../../services/youtube/pipeline");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");

const router = express.Router();

const PAGE_SIZE = 20;

// GET /admin/youtube/activity — Activity Log with filtering & pagination
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const selectedStatus = (req.query.status || "all").toLowerCase().trim();
    const selectedVideoId = (req.query.videoId || "all").trim();

    const filter = {};
    if (selectedStatus && selectedStatus !== "all") {
      filter.status = selectedStatus;
    }
    if (selectedVideoId && selectedVideoId !== "all") {
      filter.videoId = selectedVideoId;
    }

    const [logs, totalLogs, distinctVideoIds] = await Promise.all([
      YtReplyLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      YtReplyLog.countDocuments(filter),
      YtReplyLog.distinct("videoId"),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
    const csrfToken = generateToken(req, res);

    return res.render("youtube/activity/index", {
      logs,
      currentPage: page,
      totalPages,
      totalLogs,
      selectedStatus,
      selectedVideoId,
      distinctVideoIds,
      csrfToken,
      title: "YouTube Activity — ReelRelay",
      platform: "youtube",
      section: "activity",
      activeNav: "activity",
    });
  } catch (err) {
    logger.error({ err }, "Error rendering YouTube activity log");
    return next(err);
  }
});

// POST /admin/youtube/activity/:id/retry — Retry failed or deferred comment reply
router.post("/:id/retry", async (req, res) => {
  try {
    const log = await YtReplyLog.findById(req.params.id);
    if (!log) {
      req.session.flash = { type: "error", message: "Log record not found." };
      return res.redirect("/admin/youtube/activity");
    }

    if (log.status !== "failed" && log.status !== "deferred") {
      req.session.flash = {
        type: "warning",
        message: `Only failed or deferred items can be retried. Current status is ${log.status}.`,
      };
      return res.redirect("/admin/youtube/activity");
    }

    // 7-day age guard
    const commentTime = new Date(log.commentedAt || log.createdAt).getTime();
    const ageDays = (Date.now() - commentTime) / (1000 * 60 * 60 * 24);
    if (ageDays >= 7) {
      req.session.flash = {
        type: "error",
        message: "Cannot retry comments older than 7 days (YouTube policy & staleness limit).",
      };
      return res.redirect("/admin/youtube/activity");
    }

    // Associated Rule Check
    const rule = await YtVideoRule.findById(log.ruleId);
    if (!rule || !rule.active) {
      req.session.flash = {
        type: "error",
        message: "Associated video rule is inactive or no longer exists. Please activate it before retrying.",
      };
      return res.redirect("/admin/youtube/activity");
    }

    // Execute retry
    const resResult = await pipeline.processComment(
      {
        commentId: log.commentId,
        videoId: log.videoId,
        authorChannelId: log.authorChannelId,
        authorName: log.authorName,
        commentText: log.commentText,
        publishedAt: log.commentedAt,
      },
      rule,
      { skipDelay: true, existingLogId: log._id }
    );

    if (resResult.status === "posted") {
      req.session.flash = {
        type: "success",
        message: "Reply sent successfully!",
      };
    } else if (resResult.status === "deferred") {
      req.session.flash = {
        type: "warning",
        message: `Reply deferred: ${resResult.skipReason || "Quota / hourly cap"}`,
      };
    } else {
      req.session.flash = {
        type: "error",
        message: `Failed to retry reply: ${resResult.error || "Unknown error"}`,
      };
    }
  } catch (err) {
    logger.error({ err, logId: req.params.id }, "Error retrying YouTube comment reply");
    req.session.flash = {
      type: "error",
      message: `Failed to retry reply: ${err.message}`,
    };
  }

  return res.redirect("/admin/youtube/activity");
});

module.exports = router;
