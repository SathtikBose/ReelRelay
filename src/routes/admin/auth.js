const express = require("express");
const crypto = require("crypto");
const { env } = require("../../config/env");
const { loginLimiter } = require("../../middleware/rateLimiter");
const { generateToken } = require("../../middleware/csrf");
const { logger } = require("../../lib/logger");

const router = express.Router();

/**
 * Constant-time password verification using SHA-256 digests
 * @param {string} inputPassword
 * @returns {boolean}
 */
function verifyPassword(inputPassword) {
  if (typeof inputPassword !== "string" || !inputPassword) {
    return false;
  }
  const expectedHash = crypto.createHash("sha256").update(env.ADMIN_PASSWORD).digest();
  const inputHash = crypto.createHash("sha256").update(inputPassword).digest();
  return crypto.timingSafeEqual(expectedHash, inputHash);
}

// GET /admin/login
router.get("/login", (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect("/admin");
  }

  const csrfToken = generateToken(req, res);
  return res.render("auth/login", {
    csrfToken,
    error: null,
    title: "Admin Login — ReelRelay",
  });
});

// POST /admin/login (rate-limited)
router.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};

  if (!verifyPassword(password)) {
    logger.warn({ ip: req.ip }, "Failed admin login attempt");
    const csrfToken = generateToken(req, res);
    return res.status(401).render("auth/login", {
      csrfToken,
      error: "Incorrect password",
      title: "Admin Login — ReelRelay",
    });
  }

  logger.info({ ip: req.ip }, "Successful admin login");
  req.session.isAdmin = true;
  return res.redirect("/admin");
});

// POST /admin/logout
router.post("/logout", (req, res) => {
  req.session = null;
  return res.redirect("/admin/login");
});

module.exports = router;
