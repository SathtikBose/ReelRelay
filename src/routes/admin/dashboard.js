const express = require("express");
const { getDashboardData } = require("../../services/statsService");
const { generateToken } = require("../../middleware/csrf");

const router = express.Router();

// GET /admin — Main Dashboard
router.get("/", async (req, res, next) => {
  try {
    const data = await getDashboardData();
    const csrfToken = generateToken(req, res);

    return res.render("dashboard/index", {
      ...data,
      csrfToken,
      title: "Dashboard — ReelRelay",
      activeNav: "dashboard",
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
