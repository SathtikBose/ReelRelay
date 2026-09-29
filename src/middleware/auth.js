/**
 * Authentication middleware for admin routes
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  const isJson =
    req.xhr ||
    req.path.startsWith("/api") ||
    req.headers.accept?.includes("application/json") ||
    req.baseUrl?.includes("/api");

  if (isJson) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }

  return res.redirect("/admin/login");
}

module.exports = {
  requireAuth,
};
