const { YtReplyLog } = require("../../models/YtReplyLog");
const { YtVideoRule } = require("../../models/YtVideoRule");
const { YtState } = require("../../models/YtState");
const { ReplyLog } = require("../../models/ReplyLog");
const quotaService = require("./quotaService");
const credentialService = require("./credentialService");
const { env } = require("../../config/env");

/**
 * Aggregates all statistics, quota meter data, and alert states for the YouTube dashboard
 * @returns {Promise<object>}
 */
async function getYtDashboardData() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    ytStatus,
    quotaStatus,
    repliedToday,
    replied7Days,
    failedTotal,
    deferredTotal,
    activeRules,
    totalRules,
    disabledRules,
    ytState,
    recentActivity,
  ] = await Promise.all([
    credentialService.getStatus(),
    quotaService.getQuotaStatus(),
    YtReplyLog.countDocuments({ status: "posted", processedAt: { $gte: startOfDay } }),
    YtReplyLog.countDocuments({ status: "posted", processedAt: { $gte: sevenDaysAgo } }),
    YtReplyLog.countDocuments({ status: "failed" }),
    YtReplyLog.countDocuments({ status: "deferred" }),
    YtVideoRule.countDocuments({ active: true }),
    YtVideoRule.countDocuments({}),
    YtVideoRule.find({ active: false, "stats.failed": { $gt: 0 } }).lean(),
    YtState.findOne({ key: "youtube" }).lean(),
    YtReplyLog.find().sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const alerts = [];

  if (ytStatus.status === "needs_reauth") {
    alerts.push({
      type: "danger",
      message: `YouTube authentication expired. ${ytStatus.lastError || "Please reconnect your account."}`,
    });
  }

  if (quotaStatus.isExceeded) {
    alerts.push({
      type: "warning",
      message: "Daily YouTube quota budget reached. New automated replies are deferred until midnight Pacific.",
    });
  }

  if (disabledRules && disabledRules.length > 0) {
    alerts.push({
      type: "warning",
      message: `${disabledRules.length} video rule${disabledRules.length === 1 ? "" : "s"} paused automatically due to disabled comments or errors.`,
    });
  }

  if (!env.YT_POLL_ENABLED) {
    alerts.push({
      type: "info",
      message: "YouTube polling engine is currently disabled via YT_POLL_ENABLED=false.",
    });
  }

  return {
    ytStatus,
    quotaStatus,
    stats: {
      repliedToday,
      replied7Days,
      failedTotal,
      deferredTotal,
      activeRules,
      totalRules,
    },
    alerts,
    recentActivity,
    lastPoll: {
      at: ytState?.lastPollAt || null,
      status: ytState?.lastPollStatus || "idle",
      summary: ytState?.lastPollSummary || { rules: 0, comments: 0, replies: 0, errors: 0 },
    },
  };
}

/**
 * Fetches combined recent activity across Instagram and YouTube
 * @param {number} [limit=10]
 * @returns {Promise<Array<object>>}
 */
async function getCombinedRecentActivity(limit = 10) {
  const [igLogs, ytLogs] = await Promise.all([
    ReplyLog.find().sort({ createdAt: -1 }).limit(limit).lean(),
    YtReplyLog.find().sort({ createdAt: -1 }).limit(limit).lean(),
  ]);

  const mappedIg = igLogs.map((item) => ({
    _id: item._id,
    platform: "instagram",
    createdAt: item.createdAt,
    recipientOrAuthor: item.commenterUsername || "unknown",
    keyword: item.matchedKeyword || "—",
    status: item.status,
    error: item.errorMessage,
  }));

  const mappedYt = ytLogs.map((item) => ({
    _id: item._id,
    platform: "youtube",
    createdAt: item.createdAt,
    recipientOrAuthor: item.authorName || "unknown",
    keyword: item.matchedKeyword || "—",
    status: item.status,
    error: item.errorMessage,
    videoId: item.videoId,
    commentId: item.commentId,
  }));

  const combined = [...mappedIg, ...mappedYt];
  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return combined.slice(0, limit);
}

module.exports = {
  getYtDashboardData,
  getCombinedRecentActivity,
};
