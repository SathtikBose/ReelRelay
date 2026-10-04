const { YtVideoRule } = require("../../models/YtVideoRule");
const { YtState } = require("../../models/YtState");
const normalizer = require("./normalizer");
const pipeline = require("./pipeline");
const ytClient = require("./ytClient");
const quotaService = require("./quotaService");
const credentialService = require("./credentialService");
const { env } = require("../../config/env");
const { logger } = require("../../lib/logger");

const LOCK_DURATION_MS = 4 * 60 * 1000; // 4 minutes

/**
 * Calculates adaptive polling interval based on video publish age
 * @param {Date} [publishedAt]
 * @returns {number} Interval in milliseconds
 */
function calculateAdaptiveIntervalMs(publishedAt) {
  if (!publishedAt) {
    return 15 * 60 * 1000; // default 15 minutes
  }

  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 48) {
    // Video published in last 48 hours -> fast polling (3 minutes)
    return 3 * 60 * 1000;
  }
  if (ageHours < 24 * 7) {
    // Video published in last 7 days -> medium polling (15 minutes)
    return 15 * 60 * 1000;
  }
  // Older video -> standard polling (60 minutes)
  return 60 * 60 * 1000;
}

/**
 * Attempts to acquire atomic poll lock in yt_state
 * @returns {Promise<boolean>} True if lock acquired, false if already locked
 */
async function acquirePollLock() {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);

  const state = await YtState.findOneAndUpdate(
    {
      key: "youtube",
      $or: [
        { lockUntil: { $exists: false } },
        { lockUntil: null },
        { lockUntil: { $lte: now } },
      ],
    },
    {
      $set: { lockUntil },
    },
    { new: true }
  );

  return !!state;
}

/**
 * Releases atomic poll lock in yt_state
 * @param {object} [summary]
 */
async function releasePollLock(summary = null) {
  const update = {
    $set: {
      lockUntil: null,
      lastPollAt: new Date(),
    },
  };

  if (summary) {
    update.$set.lastPollStatus = summary.status || "ok";
    update.$set.lastPollSummary = {
      rules: summary.rules || 0,
      comments: summary.comments || 0,
      replies: summary.replies || 0,
      errors: summary.errors || 0,
    };
  }

  await YtState.updateOne({ key: "youtube" }, update);
}

/**
 * Executes a single complete YouTube polling cycle across all due rules
 * @param {object} [options]
 * @param {boolean} [options.force=false] Force run even if not due or locked
 * @returns {Promise<{ status: string, skipped?: boolean, reason?: string, summary?: object }>}
 */
async function pollOnce(options = {}) {
  // Check global enabled flags
  if (!env.YT_ENABLED || !env.YT_POLL_ENABLED) {
    return { skipped: true, reason: "disabled" };
  }

  // Check channel connection
  const ytStatus = await credentialService.getStatus();
  if (!ytStatus.connected) {
    return { skipped: true, reason: "not_connected" };
  }

  // Check quota budget
  const quotaStatus = await quotaService.getQuotaStatus();
  if (quotaStatus.isExceeded) {
    logger.warn({ quotaExceededUntil: quotaStatus.quotaExceededUntil }, "Skipping poll cycle: daily quota exceeded");
    return { skipped: true, reason: "quota_exceeded" };
  }

  // Acquire atomic lock unless forcing
  if (!options.force) {
    const locked = await acquirePollLock();
    if (!locked) {
      logger.info("Skipping poll cycle: another poller instance holds the lock");
      return { skipped: true, reason: "locked" };
    }
  }

  const summary = {
    rules: 0,
    comments: 0,
    replies: 0,
    errors: 0,
    status: "ok",
  };

  try {
    const accessToken = await credentialService.getAccessToken();

    // 1. Process any deferred comments from previous cycles first
    await pipeline.processDeferredQueue().catch((err) => {
      logger.warn({ err }, "Error processing deferred queue during poll");
    });

    // 2. Select due active rules
    const now = new Date();
    const query = { active: true };
    if (!options.force) {
      query.$or = [
        { "cursor.nextPollAt": { $exists: false } },
        { "cursor.nextPollAt": null },
        { "cursor.nextPollAt": { $lte: now } },
      ];
    }

    const dueRules = await YtVideoRule.find(query);
    summary.rules = dueRules.length;

    for (const rule of dueRules) {
      try {
        const result = await pollRule(rule, accessToken, ytStatus.channelId);
        summary.comments += result.comments;
        summary.replies += result.replies;
        summary.errors += result.errors;
      } catch (ruleErr) {
        summary.errors += 1;
        logger.error({ ruleErr, videoId: rule.videoId }, "Error polling video rule");
      }
    }

    await releasePollLock(summary);
    logger.info(summary, "Completed YouTube poll cycle");
    return { status: "ok", summary };
  } catch (err) {
    summary.status = "error";
    summary.errors += 1;
    await releasePollLock(summary);
    logger.error({ err }, "Fatal error during YouTube poll cycle");
    return { status: "error", summary, error: err.message };
  }
}

/**
 * Polls comments for a specific rule, advances cursor, and processes matching comments
 * @param {object} rule - YtVideoRule document
 * @param {string} accessToken
 * @param {string} myChannelId
 * @returns {Promise<{ comments: number, replies: number, errors: number }>}
 */
async function pollRule(rule, accessToken, myChannelId) {
  const result = { comments: 0, replies: 0, errors: 0 };
  const lastSeenAt = rule.cursor?.lastSeenAt ? new Date(rule.cursor.lastSeenAt) : new Date();

  let pageToken = undefined;
  let pageCount = 0;
  let collectedComments = [];
  let newestPublishedAt = null;

  // Max 5 pages per rule per cycle to safeguard quota
  while (pageCount < 5) {
    pageCount++;

    // Check quota before fetching comment list (1 unit)
    const hasQuota = await quotaService.checkQuotaAvailable(1);
    if (!hasQuota) {
      break;
    }

    let response;
    try {
      response = await ytClient.listCommentThreads(accessToken, rule.videoId, {
        maxResults: 50,
        pageToken,
      });
      await quotaService.addQuotaUsage(1);
    } catch (err) {
      if (err.ytReason === "commentsDisabled") {
        rule.active = false;
        await rule.save();
      }
      throw err;
    }

    const rawItems = response.items || [];
    if (rawItems.length === 0) {
      break;
    }

    const normalizedEvents = normalizer.normalizeCommentThreads(rawItems, myChannelId);
    let reachedCursor = false;

    for (const comment of normalizedEvents) {
      // Track the newest timestamp seen
      if (!newestPublishedAt || comment.publishedAt > newestPublishedAt) {
        newestPublishedAt = comment.publishedAt;
      }

      // Stop condition: reached comments older than or equal to lastSeenAt
      if (comment.publishedAt <= lastSeenAt) {
        reachedCursor = true;
        break;
      }

      collectedComments.push(comment);
    }

    if (reachedCursor || !response.nextPageToken) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  result.comments = collectedComments.length;

  // Process collected comments in OLDEST-FIRST order
  collectedComments.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  for (const comment of collectedComments) {
    try {
      const processRes = await pipeline.processComment(comment, rule);
      if (processRes.status === "posted") {
        result.replies += 1;
      } else if (processRes.status === "failed") {
        result.errors += 1;
      }
    } catch (err) {
      result.errors += 1;
      logger.error({ err, commentId: comment.commentId }, "Error processing comment in poll");
    }
  }

  // Advance cursor on rule
  const intervalMs = calculateAdaptiveIntervalMs(rule.publishedAt);
  const nextPollAt = new Date(Date.now() + intervalMs);

  rule.cursor = {
    lastSeenAt: newestPublishedAt && newestPublishedAt > lastSeenAt ? newestPublishedAt : lastSeenAt,
    lastPolledAt: new Date(),
    nextPollAt,
  };

  await rule.save();
  return result;
}

module.exports = {
  pollOnce,
  pollRule,
  calculateAdaptiveIntervalMs,
  acquirePollLock,
  releasePollLock,
};
