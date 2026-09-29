const crypto = require("crypto");

/**
 * Middleware that attaches or creates a unique request ID
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers["x-request-id"];
  const id = typeof incomingId === "string" && incomingId.trim() ? incomingId : crypto.randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

module.exports = {
  requestIdMiddleware,
};
