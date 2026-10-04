const express = require("express");
const oauthRoutes = require("./oauth");
const credentialService = require("../../../services/youtube/credentialService");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");

const router = express.Router();

// Mount OAuth flow routes
router.use("/oauth", oauthRoutes);

// GET /admin/youtube — YouTube Dashboard
router.get("/", async (req, res, next) => {
  try {
    const ytStatus = await credentialService.getStatus();
    const csrfToken = generateToken(req, res);

    return res.render("youtube/index", {
      ytStatus,
      csrfToken,
      title: "YouTube Dashboard — ReelRelay",
      platform: "youtube",
      section: "dashboard",
      activeNav: "dashboard",
    });
  } catch (err) {
    logger.error({ err }, "Error rendering YouTube dashboard");
    return next(err);
  }
});

// POST /admin/youtube/disconnect — Disconnect channel and revoke tokens
router.post("/disconnect", async (req, res) => {
  try {
    await credentialService.disconnect();
    req.session.flash = {
      type: "success",
      message: "YouTube channel disconnected successfully.",
    };
  } catch (err) {
    logger.error({ err }, "Error disconnecting YouTube channel");
    req.session.flash = {
      type: "error",
      message: `Failed to disconnect YouTube channel: ${err.message}`,
    };
  }
  return res.redirect("/admin/youtube");
});

module.exports = router;
