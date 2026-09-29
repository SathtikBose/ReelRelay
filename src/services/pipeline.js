const { enqueueTask } = require("../lib/queue");
const { findRuleByMediaId } = require("./ruleService");
const { matchComment } = require("./matcher");
const { render } = require("./template");
const instagramClient = require("./instagramClient");
const { Reel } = require("../models/Reel");
const { ReplyLog } = require("../models/ReplyLog");
const { env } = require("../config/env");
const { logger } = require("../lib/logger");
const { InstagramApiError } = require("../lib/errors");

// Exponential backoff retry delays (1s, 4s, 15s in production; shortened in test)
const RETRY_DELAYS_MS = env.NODE_ENV === "test" ? [10, 20, 40] : [1000, 4000, 15000];
const MAX_ATTEMPTS = 3;

/**
 * Sleeps for the specified number of milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handles the complete pipeline for a single comment event
 * @param {import('./normalizer').CommentEvent} event
 * @returns {Promise<{ status: string, reason?: string, messageId?: string, error?: string }>}
 */
async function processCommentEvent(event) {
  const { commentId, mediaId, text, commenterId, commenterUsername, commentedAt } = event;

  // 1. Look up rule for this reel
  const rule = await findRuleByMediaId(mediaId);
  if (!rule) {
    logger.debug({ commentId, mediaId }, "No rule configured for reel media ID");
    if (env.LOG_SKIPPED) {
      await ReplyLog.create({
        commentId,
        mediaId,
        commenterId,
        commenterUsername,
        commentText: text,
        status: "skipped",
        skipReason: "no_rule",
        commentedAt,
        processedAt: new Date(),
      }).catch(() => {});
    }
    return { status: "skipped", reason: "no_rule" };
  }

  // 2. Check if rule is active
  if (!rule.active) {
    logger.debug({ commentId, mediaId, ruleId: rule._id }, "Reel rule is paused/inactive");
    if (env.LOG_SKIPPED) {
      await ReplyLog.create({
        commentId,
        mediaId,
        reelId: rule._id,
        commenterId,
        commenterUsername,
        commentText: text,
        status: "skipped",
        skipReason: "inactive",
        commentedAt,
        processedAt: new Date(),
      }).catch(() => {});
    }
    return { status: "skipped", reason: "inactive" };
  }

  // 3. Match comment text against rule keywords
  const matchedKeyword = matchComment(text, rule.keywords, rule.matchMode);
  if (!matchedKeyword) {
    logger.debug({ commentId, mediaId, text }, "Comment did not match rule keywords");
    if (env.LOG_SKIPPED) {
      await ReplyLog.create({
        commentId,
        mediaId,
        reelId: rule._id,
        commenterId,
        commenterUsername,
        commentText: text,
        status: "skipped",
        skipReason: "no_match",
        commentedAt,
        processedAt: new Date(),
      }).catch(() => {});
    }
    return { status: "skipped", reason: "no_match" };
  }

  // 4. Claim the comment atomically by creating the ReplyLog document (Idempotency key: commentId)
  let replyLog;
  try {
    replyLog = await ReplyLog.create({
      commentId,
      mediaId,
      reelId: rule._id,
      commenterId,
      commenterUsername,
      commentText: text,
      matchedKeyword,
      status: "processing",
      attempts: 0,
      commentedAt,
      processedAt: new Date(),
    });
  } catch (err) {
    // Unique index violation (E11000) -> Already claimed/processed
    if (err.code === 11000 || err.name === "MongoServerError") {
      logger.info({ commentId }, "Comment already claimed/processed by pipeline (idempotent ignore)");
      return { status: "duplicate", commentId };
    }
    throw err;
  }

  // 5. Per-user-per-reel deduplication check (has user already received a DM for this reel from another comment?)
  if (commenterId) {
    const alreadySent = await ReplyLog.findOne({
      mediaId,
      commenterId,
      status: "sent",
      commentId: { $ne: commentId },
    });
    if (alreadySent) {
      logger.info({ commentId, commenterId, mediaId }, "Skipping duplicate DM for already-messaged user on this reel");
      replyLog.status = "skipped";
      replyLog.skipReason = "duplicate_user";
      replyLog.processedAt = new Date();
      await replyLog.save();
      return { status: "skipped", reason: "duplicate_user" };
    }
  }

  // 6. Render the DM message
  const dmText = render(rule.dmTemplate, {
    link: rule.link,
    username: commenterUsername,
    keyword: matchedKeyword,
  });

  // 7. Dispatch private reply with retry policy
  let lastError = null;
  let attempts = 0;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    replyLog.attempts = attempts;

    try {
      const sendResult = await instagramClient.sendPrivateReply(commentId, dmText);

      // Success
      replyLog.status = "sent";
      replyLog.messageId = sendResult.message_id || "";
      replyLog.processedAt = new Date();
      await replyLog.save();

      // Update reel statistics atomically
      await Reel.findByIdAndUpdate(rule._id, {
        $inc: { "stats.matched": 1, "stats.sent": 1 },
      });

      logger.info(
        { commentId, messageId: sendResult.message_id, attempts },
        "Private reply DM sent successfully"
      );

      return { status: "sent", messageId: sendResult.message_id };
    } catch (err) {
      lastError = err;
      const isInstagramError = err instanceof InstagramApiError || err?.name === "InstagramApiError";
      const errorType = err.errorType || (isInstagramError ? err.errorType : "transient");

      logger.warn(
        { commentId, attempt: attempts, errorType, err: err.message },
        `Send DM attempt ${attempts} failed`
      );

      // If permanent or auth error, do not retry
      if (errorType === "permanent" || errorType === "auth") {
        break;
      }

      // If transient error and we haven't reached max attempts, wait with backoff
      if (i < MAX_ATTEMPTS - 1) {
        const delay = RETRY_DELAYS_MS[i] || 1000;
        await sleep(delay);
      }
    }
  }

  // Permanent failure or exhausted retries
  replyLog.status = "failed";
  replyLog.errorCode = lastError?.igCode ? String(lastError.igCode) : lastError?.code || "SEND_FAILED";
  replyLog.errorMessage = (lastError?.message || "Failed to send private reply").slice(0, 500);
  replyLog.processedAt = new Date();
  await replyLog.save();

  await Reel.findByIdAndUpdate(rule._id, {
    $inc: { "stats.matched": 1, "stats.failed": 1 },
  });

  logger.error(
    { commentId, attempts, errorCode: replyLog.errorCode, errorMessage: replyLog.errorMessage },
    "Private reply failed permanently"
  );

  return { status: "failed", error: replyLog.errorMessage };
}

/**
 * Enqueues a comment event to the background processing queue
 * @param {import('./normalizer').CommentEvent} event
 */
function enqueue(event) {
  enqueueTask(() => processCommentEvent(event).catch((err) => {
    logger.error({ err, commentId: event.commentId }, "Unexpected error in pipeline queue worker");
  }));
}

module.exports = {
  enqueue,
  processCommentEvent,
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
};
