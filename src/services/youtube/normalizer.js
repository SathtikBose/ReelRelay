/**
 * Normalizes a raw YouTube comment thread item into a clean comment event object.
 * Filters out:
 * - Empty or whitespace-only comments
 * - Comments from the channel owner (self-replies / own comments)
 * - Malformed items missing comment ID or video ID
 *
 * @param {object} item - Raw comment thread item from YouTube commentThreads.list
 * @param {string} [myChannelId=""] - The connected YouTube channel ID
 * @returns {{ commentId: string, videoId: string, authorChannelId: string, authorName: string, commentText: string, publishedAt: Date, likeCount: number } | null}
 */
function normalizeComment(item, myChannelId = "") {
  if (!item || typeof item !== "object") {
    return null;
  }

  const snippet = item.snippet || {};
  const topLevel = snippet.topLevelComment?.snippet || snippet.topLevelComment || {};

  const commentId = item.id || snippet.topLevelComment?.id || "";
  const videoId = snippet.videoId || "";
  const authorChannelId = topLevel.authorChannelId?.value || topLevel.authorChannelId || "";
  const authorName = topLevel.authorDisplayName || "Viewer";
  const commentText = (topLevel.textOriginal || topLevel.textDisplay || "").trim();
  const publishedAt = topLevel.publishedAt ? new Date(topLevel.publishedAt) : new Date();
  const likeCount = Number(topLevel.likeCount) || 0;

  if (!commentId || !videoId || !commentText) {
    return null;
  }

  // Filter out own channel comments
  if (myChannelId && authorChannelId && myChannelId.trim() === authorChannelId.trim()) {
    return null;
  }

  return {
    commentId,
    videoId,
    authorChannelId,
    authorName,
    commentText,
    publishedAt,
    likeCount,
  };
}

/**
 * Normalizes an array of raw comment thread items
 * @param {Array<object>} items
 * @param {string} [myChannelId=""]
 * @returns {Array<{ commentId: string, videoId: string, authorChannelId: string, authorName: string, commentText: string, publishedAt: Date, likeCount: number }>}
 */
function normalizeCommentThreads(items = [], myChannelId = "") {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => normalizeComment(item, myChannelId))
    .filter(Boolean);
}

module.exports = {
  normalizeComment,
  normalizeCommentThreads,
};
