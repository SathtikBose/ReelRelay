const express = require("express");
const authRoutes = require("./auth");
const reelsRoutes = require("./reels");
const apiRoutes = require("./api");
const { requireAuth } = require("../../middleware/auth");
const { doubleCsrfProtection, csrfErrorHandler } = require("../../middleware/csrf");

const router = express.Router();

// Flash messages middleware for EJS templates
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
router.use("/reels", requireAuth, reelsRoutes);
router.use("/api", requireAuth, apiRoutes);

// Root admin redirect
router.get("/", requireAuth, (req, res) => {
  return res.redirect("/admin/reels");
});

module.exports = router;
