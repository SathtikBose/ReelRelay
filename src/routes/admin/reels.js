const express = require("express");
const { z } = require("zod");
const { Reel, DEFAULT_DM_TEMPLATE } = require("../../models/reel");
const { generateToken } = require("../../middleware/csrf");
const { logger } = require("../../lib/logger");

const router = express.Router();

/**
 * Zod schema for validating reel rule creation and update
 */
const ruleInputSchema = z.object({
  mediaId: z
    .string({ required_error: "Media ID is required" })
    .trim()
    .regex(/^\d+$/, "Media ID must contain only digits"),
  keywords: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => {
      if (Array.isArray(val)) {
        return val.map((k) => k.trim().toLowerCase()).filter(Boolean);
      }
      return val
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
    })
    .refine((arr) => arr.length > 0, {
      message: "At least one keyword is required",
    })
    .refine((arr) => arr.length <= 10, {
      message: "Maximum of 10 keywords allowed",
    }),
  matchMode: z.enum(["word", "exact", "contains"]).default("word"),
  link: z
    .string({ required_error: "Link is required" })
    .trim()
    .url("Link must be a valid URL")
    .refine((url) => url.startsWith("https://"), {
      message: "Link must use HTTPS protocol (https://)",
    }),
  dmTemplate: z
    .string()
    .max(800, "Template cannot exceed 800 characters")
    .default(DEFAULT_DM_TEMPLATE),
  template: z.string().max(800).optional(),
  active: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === "true" || val === "on")
    .default(true),
  isActive: z.union([z.boolean(), z.string()]).optional(),
  caption: z.string().optional().default(""),
  captionSnippet: z.string().optional(),
  thumbnailUrl: z.string().optional().nullable().default(""),
  permalink: z.string().optional().nullable().default(""),
});

// GET /admin/reels — List all reel rules
router.get("/", async (req, res, next) => {
  try {
    const reels = await Reel.find().sort({ createdAt: -1 }).lean();
    const csrfToken = generateToken(req, res);

    return res.render("reels/index", {
      reels,
      csrfToken,
      title: "Reel Rules — ReelRelay",
      activeNav: "reels",
    });
  } catch (err) {
    return next(err);
  }
});

// GET /admin/reels/new — New rule form
router.get("/new", (req, res) => {
  const csrfToken = generateToken(req, res);

  return res.render("reels/form", {
    isEdit: false,
    rule: {
      mediaId: req.query.mediaId || "",
      keywords: [],
      matchMode: "word",
      link: "",
      dmTemplate: DEFAULT_DM_TEMPLATE,
      active: true,
      caption: "",
      thumbnailUrl: "",
      permalink: "",
    },
    errors: {},
    csrfToken,
    title: "New Reel Rule — ReelRelay",
    activeNav: "reels",
  });
});

// POST /admin/reels — Create new rule
router.post("/", async (req, res) => {
  // Normalize alias keys
  const body = {
    ...req.body,
    dmTemplate: req.body.dmTemplate || req.body.template || DEFAULT_DM_TEMPLATE,
    active: req.body.active !== undefined ? req.body.active : req.body.isActive,
    caption: req.body.caption || req.body.captionSnippet || "",
  };

  const parsed = ruleInputSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors = {};
    parsed.error.errors.forEach((err) => {
      const field = err.path[0];
      if (!fieldErrors[field]) {
        fieldErrors[field] = err.message;
      }
    });

    const csrfToken = generateToken(req, res);
    return res.status(400).render("reels/form", {
      isEdit: false,
      rule: {
        ...req.body,
        keywords: Array.isArray(req.body.keywords)
          ? req.body.keywords
          : (req.body.keywords || "").split(",").map((k) => k.trim()).filter(Boolean),
      },
      errors: fieldErrors,
      csrfToken,
      title: "New Reel Rule — ReelRelay",
      activeNav: "reels",
    });
  }

  try {
    const existing = await Reel.findOne({ mediaId: parsed.data.mediaId });
    if (existing) {
      const csrfToken = generateToken(req, res);
      return res.status(400).render("reels/form", {
        isEdit: false,
        rule: req.body,
        errors: { mediaId: "A rule for this Reel media ID already exists" },
        csrfToken,
        title: "New Reel Rule — ReelRelay",
        activeNav: "reels",
      });
    }

    await Reel.create({
      mediaId: parsed.data.mediaId,
      keywords: parsed.data.keywords,
      matchMode: parsed.data.matchMode,
      link: parsed.data.link,
      dmTemplate: parsed.data.dmTemplate || parsed.data.template || DEFAULT_DM_TEMPLATE,
      active: parsed.data.active,
      caption: parsed.data.caption || parsed.data.captionSnippet || "",
      thumbnailUrl: parsed.data.thumbnailUrl || "",
      permalink: parsed.data.permalink || "",
    });

    req.session.flash = { type: "success", message: "Rule created successfully" };
    return res.redirect("/admin/reels");
  } catch (err) {
    logger.error({ err }, "Error creating reel rule");
    const csrfToken = generateToken(req, res);
    return res.status(500).render("reels/form", {
      isEdit: false,
      rule: req.body,
      errors: { general: "An unexpected error occurred while saving the rule." },
      csrfToken,
      title: "New Reel Rule — ReelRelay",
      activeNav: "reels",
    });
  }
});

// GET /admin/reels/:id/edit — Edit rule form
router.get("/:id/edit", async (req, res, next) => {
  try {
    const rule = await Reel.findById(req.params.id).lean();
    if (!rule) {
      req.session.flash = { type: "error", message: "Rule not found" };
      return res.redirect("/admin/reels");
    }

    const csrfToken = generateToken(req, res);
    return res.render("reels/form", {
      isEdit: true,
      rule,
      errors: {},
      csrfToken,
      title: "Edit Reel Rule — ReelRelay",
      activeNav: "reels",
    });
  } catch (err) {
    return next(err);
  }
});

// POST /admin/reels/:id — Update rule
router.post("/:id", async (req, res, next) => {
  const body = {
    ...req.body,
    dmTemplate: req.body.dmTemplate || req.body.template || DEFAULT_DM_TEMPLATE,
    active: req.body.active !== undefined ? req.body.active : req.body.isActive,
    caption: req.body.caption || req.body.captionSnippet || "",
  };

  const parsed = ruleInputSchema.safeParse(body);

  if (!parsed.success) {
    const fieldErrors = {};
    parsed.error.errors.forEach((err) => {
      const field = err.path[0];
      if (!fieldErrors[field]) {
        fieldErrors[field] = err.message;
      }
    });

    const csrfToken = generateToken(req, res);
    return res.status(400).render("reels/form", {
      isEdit: true,
      rule: {
        _id: req.params.id,
        ...req.body,
        keywords: Array.isArray(req.body.keywords)
          ? req.body.keywords
          : (req.body.keywords || "").split(",").map((k) => k.trim()).filter(Boolean),
      },
      errors: fieldErrors,
      csrfToken,
      title: "Edit Reel Rule — ReelRelay",
      activeNav: "reels",
    });
  }

  try {
    const updated = await Reel.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          keywords: parsed.data.keywords,
          matchMode: parsed.data.matchMode,
          link: parsed.data.link,
          dmTemplate: parsed.data.dmTemplate || parsed.data.template || DEFAULT_DM_TEMPLATE,
          active: parsed.data.active,
          caption: parsed.data.caption || parsed.data.captionSnippet || "",
          thumbnailUrl: parsed.data.thumbnailUrl || "",
          permalink: parsed.data.permalink || "",
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      req.session.flash = { type: "error", message: "Rule not found" };
      return res.redirect("/admin/reels");
    }

    req.session.flash = { type: "success", message: "Rule updated successfully" };
    return res.redirect("/admin/reels");
  } catch (err) {
    return next(err);
  }
});

// POST /admin/reels/:id/toggle — Activate/pause rule
router.post("/:id/toggle", async (req, res, next) => {
  try {
    const rule = await Reel.findById(req.params.id);
    if (!rule) {
      req.session.flash = { type: "error", message: "Rule not found" };
      return res.redirect("/admin/reels");
    }

    rule.active = !rule.active;
    await rule.save();

    req.session.flash = {
      type: "success",
      message: `Rule ${rule.active ? "activated" : "paused"} successfully`,
    };
    return res.redirect("/admin/reels");
  } catch (err) {
    return next(err);
  }
});

// POST /admin/reels/:id/delete — Delete rule
router.post("/:id/delete", async (req, res, next) => {
  try {
    const deleted = await Reel.findByIdAndDelete(req.params.id);
    if (!deleted) {
      req.session.flash = { type: "error", message: "Rule not found" };
    } else {
      req.session.flash = { type: "success", message: "Rule deleted successfully" };
    }
    return res.redirect("/admin/reels");
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
