const PQueueImport = require("p-queue");
const PQueue = PQueueImport.default || PQueueImport;
const { logger } = require("./logger");

const queue = new PQueue({ concurrency: 3 });

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
