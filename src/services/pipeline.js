const { enqueueTask } = require("../lib/queue");
const { logger } = require("../lib/logger");

/**
 * Enqueues a comment event for pipeline processing
 * (Stub implementation for Phase 3; full matching & sending implemented in Phase 4)
 * @param {import('./normalizer').CommentEvent} event
 */
function enqueue(event) {
  enqueueTask(async () => {
    logger.info(
      {
        commentId: event.commentId,
        mediaId: event.mediaId,
        commenterUsername: event.commenterUsername,
      },
      `[Pipeline Stub] Processed comment event: "${event.text}"`
    );
  });
}

module.exports = {
  enqueue,
};
