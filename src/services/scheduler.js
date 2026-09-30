const cron = require("node-cron");
const tokenService = require("./tokenService");
const { logger } = require("../lib/logger");

let cronTask = null;

/**
 * Initializes the background scheduler for token refresh and maintenance
 */
function initScheduler() {
  // Run check on boot
  tokenService
    .refreshIfNeeded()
    .catch((err) => logger.error({ err }, "Initial boot token refresh check failed"));

  // Schedule daily check at 03:00 AM UTC
  cronTask = cron.schedule("0 3 * * *", async () => {
    logger.info("Executing scheduled daily token refresh check");
    try {
      await tokenService.refreshIfNeeded();
    } catch (err) {
      logger.error({ err }, "Scheduled token refresh failed");
    }
  });

  logger.info("Daily token refresh scheduler initialized (cron: 0 3 * * *)");
  return cronTask;
}

/**
 * Stops the scheduled cron tasks
 */
function stopScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info("Token refresh scheduler stopped");
  }
}

module.exports = {
  initScheduler,
  stopScheduler,
};
