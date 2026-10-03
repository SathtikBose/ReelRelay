const express = require("express");
const { getDashboardData } = require("../../../services/statsService");
const { generateToken } = require("../../../middleware/csrf");

const router = express.Router();

// GET /admin/instagram/dashboard — Instagram Dashboard
router.get("/dashboard", async (req, res, next) => {
  try {
    const data = await getDashboardData();
    const csrfToken = generateToken(req, res);

    return res.render("dashboard/index", {
      ...data,
      csrfToken,
      title: "Instagram Dashboard — ReelRelay",
      platform: "instagram",
      section: "dashboard",
      activeNav: "dashboard",
    });
  } catch (err) {
    return next(err);
  }
});

// GET /admin/instagram -> redirect to /admin/instagram/dashboard
router.get("/", (req, res) => {
  return res.redirect("/admin/instagram/dashboard");
});

module.exports = router;
