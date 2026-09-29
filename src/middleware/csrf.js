const { doubleCsrf } = require("csrf-csrf");
const { env } = require("../config/env");

const cookieName =
  env.NODE_ENV === "production"
    ? "__Host-reelrelay.x-csrf-token"
    : "reelrelay.x-csrf-token";

const { generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  getSessionIdentifier: (req) => (req.session?.isAdmin ? "admin" : "anon"),
  cookieName,
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: env.NODE_ENV === "production",
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getCsrfTokenFromRequest: (req) =>
    req.body?._csrf || req.headers?.["x-csrf-token"] || req.headers?.["csrf-token"],
});

/**
 * Custom CSRF error handler middleware that catches invalidCsrfTokenError
 */
function csrfErrorHandler(err, req, res, next) {
  if (
    err === invalidCsrfTokenError ||
    err.code === "EBADCSRFTOKEN" ||
    err.message?.includes("CSRF") ||
    err.message?.includes("csrf")
  ) {
    const isJson =
      req.xhr ||
      req.path.startsWith("/api") ||
      req.headers.accept?.includes("application/json") ||
      req.baseUrl?.includes("/api");

    if (isJson) {
      return res.status(403).json({
        error: {
          code: "FORBIDDEN_CSRF",
          message: "Invalid or missing CSRF token",
        },
      });
    }

    return res.status(403).render("auth/login", {
      error: "Session expired or invalid security token. Please try again.",
      title: "Security Token Expired",
    });
  }
  return next(err);
}

module.exports = {
  generateToken: generateCsrfToken,
  generateCsrfToken,
  doubleCsrfProtection,
  csrfErrorHandler,
};
