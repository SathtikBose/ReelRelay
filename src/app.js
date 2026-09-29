const path = require("path");
const express = require("express");
const cookieSession = require("cookie-session");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const { requestIdMiddleware } = require("./middleware/requestId");
const { httpLogger } = require("./lib/logger");
const { errorHandler } = require("./middleware/errorHandler");
const { NotFoundError } = require("./lib/errors");
const { env } = require("./config/env");
const healthRouter = require("./routes/health");
const webhookRouter = require("./routes/webhook");
const adminRouter = require("./routes/admin");

/**
 * Creates and configures an Express application instance
 * @returns {import('express').Application}
 */
function createApp() {
  const app = express();

  // Basic settings
  app.set("trust proxy", 1);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Static files
  app.use(express.static(path.join(__dirname, "../public")));

  // Request tracking & logging
  app.use(requestIdMiddleware);
  if (env.NODE_ENV !== "test") {
    app.use(httpLogger);
  }

  // Cookie parser for CSRF cookie support
  app.use(cookieParser(env.CSRF_SECRET));

  // Session middleware
  app.use(
    cookieSession({
      name: "reelrelay_session",
      keys: [env.SESSION_SECRET],
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      httpOnly: true,
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
    })
  );

  // Body parsers with raw-body capture for HMAC verification
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Sanitize user inputs against NoSQL injection while allowing standard dotted query params
  app.use(
    mongoSanitize({
      allowDots: true,
      replaceWith: "_",
    })
  );

  // Routes
  app.use("/", healthRouter);
  app.use("/", webhookRouter);
  app.use("/admin", adminRouter);

  // 404 handler
  app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  // Central error handling middleware
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
