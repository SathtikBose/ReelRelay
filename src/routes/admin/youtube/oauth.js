const express = require("express");
const oauth = require("../../../services/youtube/oauth");
const ytClient = require("../../../services/youtube/ytClient");
const credentialService = require("../../../services/youtube/credentialService");
const { logger } = require("../../../lib/logger");

const router = express.Router();

// GET /admin/youtube/oauth/start — Initiate Google OAuth connection
router.get("/start", (req, res) => {
  try {
    const authUrl = oauth.generateAuthUrl(req.session);
    logger.info("Redirecting admin to Google OAuth consent screen");
    return res.redirect(authUrl);
  } catch (err) {
    logger.error({ err }, "Failed to initiate Google OAuth");
    req.session.flash = {
      type: "error",
      message: err.message || "Failed to start Google OAuth connection.",
    };
    return res.redirect("/admin/youtube");
  }
});

// GET /admin/youtube/oauth/callback — OAuth redirect receiver
router.get("/callback", async (req, res) => {
  try {
    const tokenResult = await oauth.validateAndExchangeCode(req.query, req.session);
    const channel = await ytClient.getMyChannel(tokenResult.accessToken);

    await credentialService.saveCredential({
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      uploadsPlaylistId: channel.uploadsPlaylistId,
      refreshToken: tokenResult.refreshToken,
      scopes: tokenResult.scopes,
    });

    req.session.flash = {
      type: "success",
      message: `Successfully connected YouTube channel "${channel.channelTitle}"!`,
    };
    return res.redirect("/admin/youtube");
  } catch (err) {
    logger.error({ err }, "Google OAuth callback error");
    req.session.flash = {
      type: "error",
      message: `Failed to connect YouTube channel: ${err.message}`,
    };
    return res.redirect("/admin/youtube");
  }
});

module.exports = router;
