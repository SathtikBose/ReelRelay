const { env } = require("./config/env");
const { logger } = require("./lib/logger");
const { createApp } = require("./app");

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`ReelRelay server listening on port ${env.PORT} [${env.NODE_ENV}]`);
});

/**
 * Gracefully shuts down the HTTP server
 * @param {string} signal
 */
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }
    logger.info("Server closed successfully.");
    process.exit(0);
  });

  // Force close if graceful shutdown takes too long
  setTimeout(() => {
    logger.error("Forced shutdown due to timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled Rejection at Promise");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught Exception thrown");
  process.exit(1);
});

module.exports = server;
