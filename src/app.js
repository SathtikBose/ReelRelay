const express = require("express");
const { requestIdMiddleware } = require("./middleware/requestId");
const { httpLogger } = require("./lib/logger");
const { errorHandler } = require("./middleware/errorHandler");
const { NotFoundError } = require("./lib/errors");
const { env } = require("./config/env");
const healthRouter = require("./routes/health");

/**
 * Creates and configures an Express application instance
 * @returns {import('express').Application}
 */
function createApp() {
  const app = express();

  // Basic settings
  app.set("trust proxy", 1);

  // Request tracking & logging
  app.use(requestIdMiddleware);
  if (env.NODE_ENV !== "test") {
    app.use(httpLogger);
  }

  // Body parsers
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Routes
  app.use("/", healthRouter);

  // 404 handler
  app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  // Error handling middleware
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
