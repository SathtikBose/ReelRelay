const express = require("express");
const { getDashboardData } = require("../../services/statsService");
const ytStatsService = require("../../services/youtube/statsService");
const { generateToken } = require("../../middleware/csrf");

const router = express.Router();

// GET /admin — Overview Dashboard
router.get("/", async (req, res, next) => {
  try {
    const [igData, ytData, combinedActivity] = await Promise.all([
      getDashboardData(),
      ytStatsService.getYtDashboardData(),
      ytStatsService.getCombinedRecentActivity(10),
    ]);

    const csrfToken = generateToken(req, res);

    return res.render("overview/index", {
      instagram: {
        stats: igData.stats,
        tokenStatus: igData.tokenStatus,
        alerts: igData.alerts,
      },
      youtube: {
        connected: !!ytData.ytStatus?.connected,
        configured: !!ytData.ytStatus?.configured,
        status: ytData.ytStatus?.status,
        channelTitle: ytData.ytStatus?.channelTitle,
        quotaStatus: ytData.quotaStatus,
        stats: {
          repliedToday: ytData.stats.repliedToday,
          replied7Days: ytData.stats.replied7Days,
          failedTotal: ytData.stats.failedTotal,
          deferredTotal: ytData.stats.deferredTotal,
          activeRules: ytData.stats.activeRules,
          totalRules: ytData.stats.totalRules,
          quotaUsedToday: ytData.quotaStatus?.quotaUsed || 0,
          quotaBudget: ytData.quotaStatus?.quotaBudget || 9000,
        },
        alerts: ytData.alerts,
      },
      recentActivity: combinedActivity,
      csrfToken,
      title: "Overview — ReelRelay",
      platform: "overview",
      section: "overview",
      activeNav: "overview",
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
