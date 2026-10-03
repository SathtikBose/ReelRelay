const express = require("express");
const { ReplyLog } = require("../../../models/ReplyLog");
const { Reel } = require("../../../models/Reel");
const { render } = require("../../../services/template");
const instagramClient = require("../../../services/instagramClient");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");

const router = express.Router();

const PAGE_SIZE = 25;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// GET /admin/instagram/activity — Activity log with filters and pagination
router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const statusFilter = req.query.status || "all";
    const mediaIdFilter = req.query.mediaId ? req.query.mediaId.trim() : "";

    const query = {};

    if (statusFilter && statusFilter !== "all") {
      query.status = statusFilter;
    }

    if (mediaIdFilter) {
      query.mediaId = mediaIdFilter;
    }

    const [totalCount, logs, reels] = await Promise.all([
      ReplyLog.countDocuments(query),
      ReplyLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      Reel.find().select("mediaId caption").lean(),
    ]);

    const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
    const csrfToken = generateToken(req, res);

    return res.render("activity/index", {
      logs,
      reels,
      currentPage: page,
      totalPages,
      totalCount,
      currentStatus: statusFilter,
      currentMediaId: mediaIdFilter,
      csrfToken,
      title: "Activity Log — ReelRelay",
      platform: "instagram",
      section: "activity",
      activeNav: "activity",
      now: Date.now(),
      SEVEN_DAYS_MS,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/instagram/activity/:id/retry — Retry failed DM
router.post("/:id/retry", async (req, res) => {
  const { id } = req.params;

  try {
    const log = await ReplyLog.findById(id);

    if (!log) {
      req.session.flash = { type: "error", message: "Activity log entry not found" };
      return res.redirect("/admin/instagram/activity");
    }

    if (log.status === "sent") {
      req.session.flash = { type: "error", message: "This DM has already been sent successfully" };
      return res.redirect("/admin/instagram/activity");
    }

    // Check 7-day age window per Instagram Platform Policy
    const ageMs = Date.now() - new Date(log.createdAt).getTime();
    if (ageMs >= SEVEN_DAYS_MS) {
      req.session.flash = {
        type: "error",
        message: "Cannot retry DMs for comments older than 7 days per Instagram platform policy.",
      };
      return res.redirect("/admin/instagram/activity");
    }

    // Look up rule to get template and link
    const rule = await Reel.findOne({ mediaId: log.mediaId });
    if (!rule) {
      req.session.flash = {
        type: "error",
        message: "No active rule found for this reel media ID to construct DM text.",
      };
      return res.redirect("/admin/instagram/activity");
    }

    const templateToUse = rule.dmTemplate || rule.template;
    const dmText = render(templateToUse, {
      link: rule.link,
      username: log.commenterUsername,
      keyword: log.matchedKeyword || "",
    });

    log.attempts = (log.attempts || 1) + 1;

    try {
      const apiResult = await instagramClient.sendPrivateReply(log.commentId, dmText);
      log.status = "sent";
      log.processedAt = new Date();
      log.messageId = apiResult.message_id || "";
      log.errorMessage = "";
      log.errorCode = "";
      await log.save();

      // Atomically increment sent count
      await Reel.findByIdAndUpdate(rule._id, { $inc: { "stats.sent": 1 } });

      logger.info({ replyLogId: log._id, commentId: log.commentId }, "Successfully retried DM");
      req.session.flash = { type: "success", message: "DM retried and sent successfully!" };
    } catch (err) {
      log.status = "failed";
      log.errorMessage = (err.message || "Retry failed").slice(0, 500);
      log.errorCode = String(err.igCode || err.statusCode || "");
      await log.save();

      logger.warn({ err, replyLogId: log._id }, "Failed to retry DM");
      req.session.flash = { type: "error", message: `Retry failed: ${err.message}` };
    }

    return res.redirect("/admin/instagram/activity");
  } catch (err) {
    logger.error({ err }, "Error processing retry request");
    req.session.flash = { type: "error", message: "Unexpected error retrying DM" };
    return res.redirect("/admin/instagram/activity");
  }
});

module.exports = router;
