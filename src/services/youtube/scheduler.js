const poller = require("./poller");
const { env } = require("../../config/env");
const { logger } = require("../../lib/logger");

let pollIntervalId = null;
let isPollingActive = false;

/**
 * Executes a poll cycle safely, catching all errors
 */
async function executePollCycle() {
  if (isPollingActive) {
    logger.debug("Previous poll cycle still running, skipping interval tick");
    return;
  }

  isPollingActive = true;
  try {
    await poller.pollOnce();
  } catch (err) {
    logger.error({ err }, "Unhandled error during scheduled YouTube poll cycle");
  } finally {
    isPollingActive = false;
  }
}

/**
 * Initializes the background YouTube polling scheduler
 */
function initScheduler() {
  if (!env.YT_ENABLED || !env.YT_POLL_ENABLED) {
    logger.info("YouTube poller scheduler is disabled in environment");
    return;
  }

  if (process.env.NODE_ENV === "test") {
    logger.info("Skipping YouTube poller scheduler in test environment");
    return;
  }

  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }

  const intervalSec = env.YT_POLL_BASE_INTERVAL_SEC || 300;
  const intervalMs = intervalSec * 1000;

  pollIntervalId = setInterval(executePollCycle, intervalMs);
  logger.info({ intervalSec }, "YouTube poller scheduler initialized");

  // Run initial poll after a brief 10-second startup buffer
  setTimeout(() => {
    executePollCycle().catch((err) => {
      logger.warn({ err }, "Initial startup YouTube poll cycle failed");
    });
  }, 10000);
}

/**
 * Stops the background scheduler
 */
function stopScheduler() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
    logger.info("YouTube poller scheduler stopped");
  }
}

/**
 * Triggers an immediate manual poll cycle (e.g. from Admin UI 'Poll Now' button)
 * @returns {Promise<object>} Poll cycle result
 */
async function pollNow() {
  return poller.pollOnce({ force: true });
}

/**
 * Checks if scheduler is currently active
 * @returns {boolean}
 */
function isRunning() {
  return pollIntervalId !== null;
}

module.exports = {
  initScheduler,
  stopScheduler,
  pollNow,
  isRunning,
};
