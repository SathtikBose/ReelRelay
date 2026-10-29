const express = require("express");
const authRoutes = require("./auth");
const overviewRoutes = require("./overview");
const instagramRoutes = require("./instagram");
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
  res.locals.originalUrl = req.originalUrl;
  res.locals.isAdmin = req.session?.isAdmin === true;
  next();
});

// Apply CSRF protection to all non-GET admin actions
router.use(doubleCsrfProtection);
router.use(csrfErrorHandler);

// Public Auth routes (login/logout)
router.use("/", authRoutes);

// Helper for 302 backwards-compatibility redirects with query preservation
function createLegacyRedirect(targetSection) {
  return (req, res) => {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const subPath = req.path === "/" ? "" : req.path;
    return res.redirect(302, `/admin/instagram/${targetSection}${subPath}${query}`);
  };
}

// Legacy Instagram URL 302 redirects
router.use("/reels", createLegacyRedirect("reels"));
router.use("/activity", createLegacyRedirect("activity"));
router.use("/settings", createLegacyRedirect("settings"));
router.use("/api", createLegacyRedirect("api"));

// Protected Admin routes
router.use("/instagram", requireAuth, instagramRoutes);
router.use("/", requireAuth, overviewRoutes);

module.exports = router;
