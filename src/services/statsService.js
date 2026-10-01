const { ReplyLog } = require("../models/ReplyLog");
const { Reel } = require("../models/Reel");
const tokenService = require("./tokenService");

/**
 * Aggregates all statistics and alert states for the admin dashboard
 * @returns {Promise<{
 *   stats: {
 *     sentToday: number,
 *     sent7Days: number,
 *     failedTotal: number,
 *     activeRules: number,
 *     tokenDaysLeft: number | null,
 *   },
 *   alerts: Array<{ type: "warning" | "danger", message: string }>,
 *   recentActivity: Array<any>,
 *   tokenStatus: any
 * }>}
 */
async function getDashboardData() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    sentToday,
    sent7Days,
    failedTotal,
    activeRules,
    tokenStatus,
    recentAuthErrors,
    recentActivity,
  ] = await Promise.all([
    ReplyLog.countDocuments({ status: "sent", sentAt: { $gte: startOfDay } }),
    ReplyLog.countDocuments({ status: "sent", sentAt: { $gte: sevenDaysAgo } }),
    ReplyLog.countDocuments({ status: "failed" }),
    Reel.countDocuments({ active: true }),
    tokenService.getTokenStatus(),
    ReplyLog.countDocuments({
      status: "failed",
      errorType: "auth",
      createdAt: { $gte: oneDayAgo },
    }),
    ReplyLog.find().sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const alerts = [];

  if (tokenStatus.exists) {
    if (tokenStatus.isExpired) {
      alerts.push({
        type: "danger",
        message: "Your Instagram Access Token has expired. Private replies are paused.",
      });
    } else if (tokenStatus.daysLeft !== null && tokenStatus.daysLeft < 10) {
      alerts.push({
        type: "warning",
        message: `Instagram Access Token expires in ${tokenStatus.daysLeft} day${tokenStatus.daysLeft === 1 ? "" : "s"}. Please refresh or replace it soon.`,
      });
    }

    if (tokenStatus.lastRefreshStatus === "error") {
      alerts.push({
        type: "danger",
        message: `Last automated token refresh failed: ${tokenStatus.lastRefreshError || "Unknown error"}`,
      });
    }
  } else {
    alerts.push({
      type: "danger",
      message: "No Instagram Access Token configured in database.",
    });
  }

  if (recentAuthErrors > 0) {
    alerts.push({
      type: "danger",
      message: `${recentAuthErrors} DM${recentAuthErrors === 1 ? "" : "s"} failed due to Instagram authorization errors in the last 24 hours.`,
    });
  }

  return {
    stats: {
      sentToday,
      sent7Days,
      failedTotal,
      activeRules,
      tokenDaysLeft: tokenStatus.daysLeft,
    },
    alerts,
    recentActivity,
    tokenStatus,
  };
}

module.exports = {
  getDashboardData,
};
