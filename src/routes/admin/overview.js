const express = require("express");

const router = express.Router();

// GET /admin — Redirects directly to Instagram Dashboard
router.get("/", (_req, res) => {
  return res.redirect(302, "/admin/instagram/dashboard");
});

module.exports = router;
