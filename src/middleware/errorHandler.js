const { logger } = require("../lib/logger");
const { AppError } = require("../lib/errors");
const { env } = require("../config/env");

/**
 * Central Express error handling middleware
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : "INTERNAL_ERROR";
  const details = isAppError && Array.isArray(err.details) ? err.details : [];

  let message = err.message || "An unexpected error occurred";
  if (!isAppError && env.NODE_ENV === "production") {
    message = "Internal server error";
  }

  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        code,
        statusCode,
      },
      reqId: req.id,
      url: req.originalUrl,
      method: req.method,
    },
    `Request error: ${err.message}`
  );

  const errorResponse = {
    error: {
      code,
      message,
      ...(details.length > 0 ? { details } : {}),
      ...(env.NODE_ENV !== "production" && !isAppError ? { stack: err.stack } : {}),
    },
  };

  // If client expects HTML and not JSON, and view engine is active
  if (req.accepts && req.accepts("html") && !req.is("json") && !req.path.startsWith("/api") && !req.path.startsWith("/webhook")) {
    if (typeof res.render === "function" && req.app.get("view engine")) {
      return res.status(statusCode).render("error", {
        title: "Error",
        statusCode,
        message,
        code,
      });
    }
  }

  return res.status(statusCode).json(errorResponse);
}

module.exports = {
  errorHandler,
};
