const express = require("express");
const { getDashboardData } = require("../../services/statsService");
const { generateToken } = require("../../middleware/csrf");

const router = express.Router();

// GET /admin — Overview Dashboard
router.get("/", async (req, res, next) => {
  try {
    const data = await getDashboardData();
    const csrfToken = generateToken(req, res);

    const formattedRecentActivity = (data.recentActivity || []).map((item) => ({
      ...item,
      platform: "instagram",
    }));

    return res.render("overview/index", {
      instagram: {
        stats: data.stats,
        tokenStatus: data.tokenStatus,
        alerts: data.alerts,
      },
      youtube: {
        connected: false,
        configured: false,
        stats: {
          posted7Days: 0,
          failedTotal: 0,
          activeRules: 0,
          quotaUsedToday: 0,
        },
      },
      recentActivity: formattedRecentActivity,
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
