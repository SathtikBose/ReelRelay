const express = require("express");
const ruleService = require("../../../services/youtube/ruleService");
const credentialService = require("../../../services/youtube/credentialService");
const { generateToken } = require("../../../middleware/csrf");
const { logger } = require("../../../lib/logger");
const { DEFAULT_REPLY_VARIANTS } = require("../../../models/YtVideoRule");

const router = express.Router();

// GET /admin/youtube/videos — List all video rules
router.get("/", async (req, res, next) => {
  try {
    const rules = await ruleService.listRules();
    const ytStatus = await credentialService.getStatus();
    const csrfToken = generateToken(req, res);

    return res.render("youtube/videos/index", {
      rules,
      ytStatus,
      csrfToken,
      title: "YouTube Video Rules — ReelRelay",
      platform: "youtube",
      section: "rules",
      activeNav: "videos",
    });
  } catch (err) {
    logger.error({ err }, "Error fetching YouTube rules list");
    return next(err);
  }
});

// GET /admin/youtube/videos/new — New rule form with picker
router.get("/new", async (req, res, next) => {
  try {
    const ytStatus = await credentialService.getStatus();
    const csrfToken = generateToken(req, res);

    const prefill = {
      videoId: req.query.videoId || "",
      title: req.query.title || "",
      thumbnailUrl: req.query.thumbnailUrl || "",
      keywords: req.query.keywords || "",
      link: req.query.link || "",
      matchMode: req.query.matchMode || "word",
      replyVariants: DEFAULT_REPLY_VARIANTS,
      backfill: false,
    };

    return res.render("youtube/videos/new", {
      ytStatus,
      prefill,
      csrfToken,
      title: "New YouTube Video Rule — ReelRelay",
      platform: "youtube",
      section: "rules",
      activeNav: "videos",
    });
  } catch (err) {
    logger.error({ err }, "Error rendering new YouTube rule form");
    return next(err);
  }
});

// POST /admin/youtube/videos — Create new rule
router.post("/", async (req, res) => {
  try {
    let variants = req.body.replyVariants;
    if (typeof variants === "string") {
      variants = variants.split("\n").map((v) => v.trim()).filter(Boolean);
    }

    const rule = await ruleService.createRule({
      videoId: req.body.videoId,
      title: req.body.title,
      thumbnailUrl: req.body.thumbnailUrl,
      keywords: req.body.keywords,
      link: req.body.link,
      matchMode: req.body.matchMode,
      replyVariants: variants,
      backfill: req.body.backfill === "true" || req.body.backfill === "on",
    });

    req.session.flash = {
      type: "success",
      message: `Created rule for YouTube video "${rule.title || rule.videoId}".`,
    };
    return res.redirect("/admin/youtube/videos");
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to create YouTube video rule");
    req.session.flash = {
      type: "error",
      message: err.message || "Failed to create rule. Please check your inputs.",
    };
    return res.redirect("/admin/youtube/videos/new");
  }
});

// GET /admin/youtube/videos/:id/edit — Edit existing rule
router.get("/:id/edit", async (req, res, next) => {
  try {
    const rule = await ruleService.getRuleById(req.params.id);
    const csrfToken = generateToken(req, res);

    return res.render("youtube/videos/edit", {
      rule,
      csrfToken,
      title: `Edit Rule: ${rule.title || rule.videoId} — ReelRelay`,
      platform: "youtube",
      section: "rules",
      activeNav: "videos",
    });
  } catch (err) {
    logger.error({ err }, "Error fetching video rule for edit");
    return next(err);
  }
});

// POST /admin/youtube/videos/:id — Update existing rule
router.post("/:id", async (req, res) => {
  try {
    let variants = req.body.replyVariants;
    if (typeof variants === "string") {
      variants = variants.split("\n").map((v) => v.trim()).filter(Boolean);
    }

    await ruleService.updateRule(req.params.id, {
      keywords: req.body.keywords,
      link: req.body.link,
      matchMode: req.body.matchMode,
      replyVariants: variants,
      title: req.body.title,
    });

    req.session.flash = {
      type: "success",
      message: "YouTube video rule updated successfully.",
    };
    return res.redirect("/admin/youtube/videos");
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to update YouTube video rule");
    req.session.flash = {
      type: "error",
      message: err.message || "Failed to update rule.",
    };
    return res.redirect(`/admin/youtube/videos/${req.params.id}/edit`);
  }
});

// POST /admin/youtube/videos/:id/toggle — Toggle active state
router.post("/:id/toggle", async (req, res) => {
  try {
    const rule = await ruleService.toggleRule(req.params.id);
    req.session.flash = {
      type: "success",
      message: `Rule for "${rule.title || rule.videoId}" is now ${rule.active ? "active" : "paused"}.`,
    };
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to toggle YouTube video rule");
    req.session.flash = {
      type: "error",
      message: err.message || "Failed to toggle rule status.",
    };
  }
  return res.redirect("/admin/youtube/videos");
});

// POST /admin/youtube/videos/:id/delete — Delete rule
router.post("/:id/delete", async (req, res) => {
  try {
    const rule = await ruleService.deleteRule(req.params.id);
    req.session.flash = {
      type: "success",
      message: `Deleted rule for "${rule.title || rule.videoId}".`,
    };
  } catch (err) {
    logger.warn({ err: err.message }, "Failed to delete YouTube video rule");
    req.session.flash = {
      type: "error",
      message: err.message || "Failed to delete rule.",
    };
  }
  return res.redirect("/admin/youtube/videos");
});

module.exports = router;
