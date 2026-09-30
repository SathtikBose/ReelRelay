const express = require("express");
const authRoutes = require("./auth");
const dashboardRoutes = require("./dashboard");
const reelsRoutes = require("./reels");
const activityRoutes = require("./activity");
const settingsRoutes = require("./settings");
const apiRoutes = require("./api");
const { requireAuth } = require("../../middleware/auth");
const { doubleCsrfProtection, csrfErrorHandler } = require("../../middleware/csrf");

const router = express.Router();

// Flash messages & template context middleware
router.use((req, res, next) => {
  res.locals.flash = req.session?.flash || null;
  if (req.session?.flash) {
    delete req.session.flash;
  }
  res.locals.currentPath = req.path;
  res.locals.isAdmin = req.session?.isAdmin === true;
  next();
});

// Apply CSRF protection to all non-GET admin actions
router.use(doubleCsrfProtection);
router.use(csrfErrorHandler);

// Public Auth routes (login/logout)
router.use("/", authRoutes);

// Protected Admin routes
router.use("/", requireAuth, dashboardRoutes);
router.use("/reels", requireAuth, reelsRoutes);
router.use("/activity", requireAuth, activityRoutes);
router.use("/settings", requireAuth, settingsRoutes);
router.use("/api", requireAuth, apiRoutes);

module.exports = router;
