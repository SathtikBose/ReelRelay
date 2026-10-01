const PQueueImport = require("p-queue");
const PQueue = PQueueImport.default || PQueueImport;
const { env } = require("../config/env");
const { logger } = require("./logger");

// 1-by-1 sequential execution with 1.2s pacing interval to prevent API exhaustion
const queue = new PQueue({
  concurrency: 1,
  intervalCap: 1,
  interval: env.NODE_ENV === "test" ? 0 : 1200,
});

queue.on("error", (err) => {
  logger.error({ err }, "Unhandled error in queue worker");
});

queue.on("idle", () => {
  logger.debug("Queue is idle");
});

/**
 * Adds an async job to the queue
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function enqueueTask(fn) {
  return queue.add(fn);
}

module.exports = {
  queue,
  enqueueTask,
};
