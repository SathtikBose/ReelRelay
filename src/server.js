const { env } = require("./config/env");
const { logger } = require("./lib/logger");
const { createApp } = require("./app");
const { connectDb, disconnectDb } = require("./lib/db");
const { bootstrapToken } = require("./services/tokenService");
const { initScheduler, stopScheduler } = require("./services/scheduler");
const ytScheduler = require("./services/youtube/scheduler");
const { subscribeAppWebhooks } = require("./services/instagramClient");
const { queue } = require("./lib/queue");

const app = createApp();

let server;

async function startServer() {
  try {
    await connectDb();
    await bootstrapToken();
    initScheduler();
    ytScheduler.initScheduler();

    try {
      await subscribeAppWebhooks();
      logger.info("Instagram webhook subscriptions verified for account");
    } catch (subErr) {
      logger.warn({ err: subErr }, "Could not automatically subscribe Instagram webhooks on start");
    }

    server = app.listen(env.PORT, () => {
      logger.info(`ReelRelay server listening on port ${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.fatal({ err }, "Failed to start ReelRelay server");
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the HTTP server, scheduler, and database connections
 * @param {string} signal
 */
async function handleShutdown(signal = "SIGTERM") {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  stopScheduler();
  ytScheduler.stopScheduler();

  // Pause queue from accepting new tasks and wait for in-flight tasks to complete
  try {
    queue.pause();
    await queue.onIdle();
    logger.info("Pipeline task queue drained successfully.");
  } catch (qErr) {
    logger.warn({ err: qErr }, "Error while draining task queue");
  }

  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error({ err }, "Error during server close");
      }
      try {
        await disconnectDb();
        logger.info("Server and database connections closed successfully.");
        if (env.NODE_ENV !== "test") {
          process.exit(0);
        }
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Error closing database connection");
        if (env.NODE_ENV !== "test") {
          process.exit(1);
        }
      }
    });
  } else {
    await disconnectDb();
    if (env.NODE_ENV !== "test") {
      process.exit(0);
    }
  }

  // Force close if graceful shutdown takes too long
  setTimeout(() => {
    logger.error("Forced shutdown due to timeout.");
    if (env.NODE_ENV !== "test") {
      process.exit(1);
    }
  }, 10000).unref();
}

if (process.env.NODE_ENV !== "test") {
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));

  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({ reason, promise }, "Unhandled Rejection at Promise");
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught Exception thrown");
    process.exit(1);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  handleShutdown,
};
