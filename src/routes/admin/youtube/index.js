const express = require("express");
const { generateToken } = require("../../../middleware/csrf");

const router = express.Router();

// GET /admin/youtube — YouTube Module Placeholder / Dashboard Shell
router.get("/", (req, res) => {
  const csrfToken = generateToken(req, res);

  return res.render("youtube/placeholder", {
    csrfToken,
    title: "YouTube — ReelRelay",
    platform: "youtube",
    section: "dashboard",
    activeNav: "dashboard",
    connected: false,
  });
});

module.exports = router;
