const { YtReplyLog } = require("../../models/YtReplyLog");
const { YtVideoRule } = require("../../models/YtVideoRule");
const { matchComment } = require("../matcher");
const { render } = require("../template");
const ytClient = require("./ytClient");
const quotaService = require("./quotaService");
const credentialService = require("./credentialService");
const { env } = require("../../config/env");
const { logger } = require("../../lib/logger");

const INSERT_REPLY_QUOTA_COST = 50;

/**
 * Random integer between min and max inclusive
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function getRandomJitterMs(min, max) {
  const minMs = Math.max(0, min || 1000);
  const maxMs = Math.max(minMs, max || 3000);
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Sleep helper
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Selects a random reply variant from the rule's variants array
 * @param {string[]} variants
 * @returns {string}
 */
function selectRandomVariant(variants = []) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "Here you go 👉 {{link}}";
  }
  const index = Math.floor(Math.random() * variants.length);
  return variants[index] || variants[0];
}

/**
 * Checks how many replies were posted across the channel in the last hour
 * @returns {Promise<number>}
 */
async function getHourlyRepliesCount() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return YtReplyLog.countDocuments({
    status: "posted",
    processedAt: { $gte: oneHourAgo },
  });
}

/**
 * Checks if a reply has already been sent to this author on this video
 * @param {string} videoId
 * @param {string} authorChannelId
 * @returns {Promise<boolean>}
 */
async function hasAuthorBeenReplied(videoId, authorChannelId) {
  if (!authorChannelId) {
    return false;
  }
  const existing = await YtReplyLog.findOne({
    videoId,
    authorChannelId,
    status: "posted",
  });
  return !!existing;
}

/**
 * Processes a single normalized YouTube comment event against a video rule
 * @param {object} event - Normalized comment event
 * @param {object} rule - YtVideoRule document
 * @param {object} [options]
 * @param {boolean} [options.skipDelay=false]
 * @returns {Promise<{ status: string, skipReason?: string, replyCommentId?: string, error?: string }>}
 */
async function processComment(event, rule, options = {}) {
  // 1. Keyword Matching
  const matchedKeyword = matchComment(event.commentText, rule.keywords, rule.matchMode);
  if (!matchedKeyword) {
    return { status: "skipped", skipReason: "no_match" };
  }

  // 2. Atomic Idempotency Claim via unique commentId
  let logDoc;
  if (options.existingLogId) {
    logDoc = await YtReplyLog.findByIdAndUpdate(
      options.existingLogId,
      { $set: { status: "processing" } },
      { new: true }
    );
  } else {
    try {
      logDoc = await YtReplyLog.create({
        commentId: event.commentId,
        videoId: rule.videoId,
        ruleId: rule._id,
        authorChannelId: event.authorChannelId,
        authorName: event.authorName,
        commentText: (event.commentText || "").slice(0, 300),
        matchedKeyword,
        status: "processing",
        commentedAt: event.publishedAt || new Date(),
      });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate commentId — already claimed / processed
        logger.debug({ commentId: event.commentId }, "Comment already claimed, skipping duplicate");
        return { status: "skipped", skipReason: "already_processed" };
      }
      throw err;
    }
  }

  // 3. One reply per author per video check (default)
  if (event.authorChannelId) {
    const alreadyReplied = await hasAuthorBeenReplied(rule.videoId, event.authorChannelId);
    if (alreadyReplied) {
      await YtReplyLog.updateOne(
        { _id: logDoc._id },
        {
          $set: {
            status: "skipped",
            skipReason: "duplicate_author",
            processedAt: new Date(),
          },
        }
      );
      return { status: "skipped", skipReason: "duplicate_author" };
    }
  }

  // 4. Hourly Rate Cap Guard
  const hourlyCount = await getHourlyRepliesCount();
  const maxPerHour = env.YT_MAX_REPLIES_PER_HOUR || 60;
  if (hourlyCount >= maxPerHour) {
    logger.warn({ hourlyCount, maxPerHour }, "YouTube hourly reply cap reached, deferring reply");
    await YtReplyLog.updateOne(
      { _id: logDoc._id },
      {
        $set: {
          status: "deferred",
          skipReason: "hourly_cap",
          processedAt: new Date(),
        },
      }
    );
    return { status: "deferred", skipReason: "hourly_cap" };
  }

  // 5. Daily Quota Guard
  const hasQuota = await quotaService.checkQuotaAvailable(INSERT_REPLY_QUOTA_COST);
  if (!hasQuota) {
    logger.warn("Insufficient daily YouTube quota, deferring reply");
    await YtReplyLog.updateOne(
      { _id: logDoc._id },
      {
        $set: {
          status: "deferred",
          skipReason: "quota_exceeded",
          processedAt: new Date(),
        },
      }
    );
    return { status: "deferred", skipReason: "quota_exceeded" };
  }

  // 6. Jitter Delay (unless in test or skipDelay requested)
  if (process.env.NODE_ENV !== "test" && !options.skipDelay) {
    const jitterMs = getRandomJitterMs(env.YT_REPLY_DELAY_MIN_MS, env.YT_REPLY_DELAY_MAX_MS);
    await sleep(jitterMs);
  }

  // 7. Render Random Reply Variant
  const variant = selectRandomVariant(rule.replyVariants);
  const replyText = render(variant, {
    link: rule.link,
    author: event.authorName,
    username: event.authorName,
    keyword: matchedKeyword,
  });

  // 8. Post Reply to YouTube
  try {
    const accessToken = await credentialService.getAccessToken();
    const replyRes = await ytClient.insertReply(accessToken, event.commentId, replyText);

    // Record success in log
    await YtReplyLog.updateOne(
      { _id: logDoc._id },
      {
        $set: {
          status: "posted",
          replyText,
          replyCommentId: replyRes.id,
          quotaCost: INSERT_REPLY_QUOTA_COST,
          processedAt: new Date(),
        },
        $inc: { attempts: 1 },
      }
    );

    // Update rule stats
    await YtVideoRule.updateOne(
      { _id: rule._id },
      {
        $inc: {
          "stats.matched": 1,
          "stats.replied": 1,
        },
      }
    );

    // Increment quota usage
    await quotaService.addQuotaUsage(INSERT_REPLY_QUOTA_COST);

    logger.info(
      { commentId: event.commentId, replyCommentId: replyRes.id, videoId: rule.videoId },
      "Posted automated YouTube comment reply"
    );

    return {
      status: "posted",
      replyCommentId: replyRes.id,
    };
  } catch (err) {
    logger.error({ err, commentId: event.commentId }, "Failed to post YouTube reply");

    // Handle Quota Exceeded (403 quotaExceeded)
    if (err.errorType === "quota" || err.ytReason === "quotaExceeded") {
      await quotaService.recordQuotaExceeded();
      await YtReplyLog.updateOne(
        { _id: logDoc._id },
        {
          $set: {
            status: "deferred",
            errorCode: "quotaExceeded",
            errorMessage: err.message.slice(0, 500),
            processedAt: new Date(),
          },
          $inc: { attempts: 1 },
        }
      );
      await YtVideoRule.updateOne({ _id: rule._id }, { $inc: { "stats.matched": 1 } });
      return { status: "deferred", skipReason: "quotaExceeded" };
    }

    // Handle Comments Disabled on Video
    if (err.ytReason === "commentsDisabled") {
      await YtVideoRule.updateOne(
        { _id: rule._id },
        {
          $set: { active: false },
          $inc: { "stats.matched": 1, "stats.failed": 1 },
        }
      );
      await YtReplyLog.updateOne(
        { _id: logDoc._id },
        {
          $set: {
            status: "failed",
            errorCode: "commentsDisabled",
            errorMessage: "Comments are disabled for this video.",
            processedAt: new Date(),
          },
          $inc: { attempts: 1 },
        }
      );
      return { status: "failed", error: "commentsDisabled" };
    }

    // Handle Auth Errors (invalid_grant / revoked token)
    if (err.errorType === "auth") {
      await credentialService.markNeedsReauth(err.message);
      await YtReplyLog.updateOne(
        { _id: logDoc._id },
        {
          $set: {
            status: "failed",
            errorCode: "auth_error",
            errorMessage: err.message.slice(0, 500),
            processedAt: new Date(),
          },
          $inc: { attempts: 1 },
        }
      );
      return { status: "failed", error: "auth_error" };
    }

    // Other Permanent / Transient Errors
    await YtReplyLog.updateOne(
      { _id: logDoc._id },
      {
        $set: {
          status: "failed",
          errorCode: err.ytReason || "error",
          errorMessage: err.message.slice(0, 500),
          processedAt: new Date(),
        },
        $inc: { attempts: 1 },
      }
    );

    await YtVideoRule.updateOne(
      { _id: rule._id },
      {
        $inc: {
          "stats.matched": 1,
          "stats.failed": 1,
        },
      }
    );

    return { status: "failed", error: err.message };
  }
}

/**
 * Processes deferred replies that are still within the 7-day age window
 * @returns {Promise<{ processed: number, posted: number, deferred: number, failed: number }>}
 */
async function processDeferredQueue() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const deferredLogs = await YtReplyLog.find({
    status: "deferred",
    commentedAt: { $gte: sevenDaysAgo },
  })
    .sort({ commentedAt: 1 }) // Oldest first
    .limit(20);

  let summary = { processed: 0, posted: 0, deferred: 0, failed: 0 };

  for (const log of deferredLogs) {
    const hasQuota = await quotaService.checkQuotaAvailable(INSERT_REPLY_QUOTA_COST);
    if (!hasQuota) {
      summary.deferred += 1;
      break;
    }

    const hourlyCount = await getHourlyRepliesCount();
    if (hourlyCount >= (env.YT_MAX_REPLIES_PER_HOUR || 60)) {
      summary.deferred += 1;
      break;
    }

    const rule = await YtVideoRule.findById(log.ruleId);
    if (!rule || !rule.active) {
      await YtReplyLog.updateOne(
        { _id: log._id },
        { $set: { status: "skipped", skipReason: "inactive", processedAt: new Date() } }
      );
      continue;
    }

    const res = await processComment(
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

    summary.processed += 1;
    if (res.status === "posted") summary.posted += 1;
    else if (res.status === "deferred") summary.deferred += 1;
    else if (res.status === "failed") summary.failed += 1;
  }

  return summary;
}

module.exports = {
  processComment,
  processDeferredQueue,
  selectRandomVariant,
  getHourlyRepliesCount,
  hasAuthorBeenReplied,
};
