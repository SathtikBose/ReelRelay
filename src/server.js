const { env } = require("./config/env");
const { logger } = require("./lib/logger");
const { createApp } = require("./app");
const { connectDb, disconnectDb } = require("./lib/db");
const { bootstrapToken } = require("./services/tokenService");

const app = createApp();

let server;

async function startServer() {
  try {
    await connectDb();
    await bootstrapToken();

    server = app.listen(env.PORT, () => {
      logger.info(`ReelRelay server listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.fatal({ err }, "Failed to start ReelRelay server");
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the HTTP server and database connections
 * @param {string} signal
 */
async function handleShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error({ err }, "Error during server close");
      }
      try {
        await disconnectDb();
        logger.info("Server and database connections closed successfully.");
        process.exit(0);
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Error closing database connection");
        process.exit(1);
      }
    });
  } else {
    await disconnectDb();
    process.exit(0);
  }

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

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
