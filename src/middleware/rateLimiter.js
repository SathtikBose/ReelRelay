const rateLimit = require("express-rate-limit");
const { env } = require("../config/env");

/**
 * Rate limiter for admin login attempts:
 * 5 attempts per 15 minutes per IP.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 10000 : 5, // Avoid throttling test suites while enforcing in dev/prod
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    const isJson = req.xhr || req.headers.accept?.includes("application/json");
    const message = "Too many login attempts. Please try again in 15 minutes.";

    if (isJson) {
      return res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message,
        },
      });
    }

    // Render login page with lockout error
    return res.status(429).render("auth/login", {
      error: message,
      title: "Login — ReelRelay",
    });
  },
});

/**
 * Rate limiter for webhook event delivery & handshake:
 * 300 requests per 1 minute per IP (generous for Meta burst traffic while preventing DoS).
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === "test" ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many webhook requests from this IP. Please slow down.",
      },
    });
  },
});

module.exports = {
  loginLimiter,
  webhookLimiter,
};
