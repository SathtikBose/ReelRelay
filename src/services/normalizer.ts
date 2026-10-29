import { logger } from "../lib/logger";

export type CommentEvent = {
  commentId: string;
  mediaId: string;
  text: string;
  commenterId: string;
  commenterUsername: string;
  parentId: string | null;
  commentedAt: Date;
  receivedAt: Date;
};

type RawChangeValue = {
  id?: string;
  text?: string;
  from?: {
    id?: string;
    username?: string;
  };
  media?: {
    id?: string;
    media_product_type?: string;
  };
  parent_id?: string;
};

type RawChange = {
  field?: string;
  value?: RawChangeValue;
};

type RawEntry = {
  id?: string;
  time?: number;
  changes?: RawChange[];
};

type RawWebhookPayload = {
  object?: string;
  entry?: RawEntry[];
};

/**
 * Normalizes raw Instagram webhook payload into valid, filtered CommentEvent objects.
 * Safely ignores non-comment events, empty comments, reply comments, and own comments.
 */
export function normalizeWebhookPayload(
  payload: unknown,
  ownUserId?: string
): CommentEvent[] {
  if (!payload || typeof payload !== "object") {
    logger.warn({}, "Invalid webhook payload received (not an object)");
    return [];
  }

  const raw = payload as RawWebhookPayload;

  if (raw.object !== "instagram") {
    logger.debug({ object: raw.object }, "Ignoring non-instagram webhook object");
    return [];
  }

  if (!Array.isArray(raw.entry)) {
    return [];
  }

  const events: CommentEvent[] = [];

  for (const entry of raw.entry) {
    const entryTime =
      typeof entry.time === "number" ? new Date(entry.time * 1000) : new Date();

    if (!Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      // Only process 'comments' webhook events
      if (change.field !== "comments" || !change.value) {
        continue;
      }

      const val = change.value;
      const commentId = typeof val.id === "string" ? val.id.trim() : "";
      const mediaId = typeof val.media?.id === "string" ? val.media.id.trim() : "";
      const text = typeof val.text === "string" ? val.text.trim() : "";
      const commenterId = typeof val.from?.id === "string" ? val.from.id.trim() : "";
      const commenterUsername =
        typeof val.from?.username === "string" ? val.from.username.trim() : "";
      const parentId =
        typeof val.parent_id === "string" && val.parent_id.trim()
          ? val.parent_id.trim()
          : null;

      // Filter 1: Missing comment ID or media ID
      if (!commentId || !mediaId) {
        logger.debug({ commentId, mediaId }, "Filtering out comment missing commentId or mediaId");
        continue;
      }

      // Filter 2: Empty comment text
      if (!text) {
        logger.debug({ commentId }, "Filtering out empty comment text");
        continue;
      }

      // Filter 3: Reply comments (parent_id is set)
      if (parentId) {
        logger.debug({ commentId, parentId }, "Filtering out reply comment (only top-level comments allowed)");
        continue;
      }

      // Filter 4: Own comments from account owner
      if (ownUserId && commenterId === ownUserId) {
        logger.debug({ commentId, commenterId }, "Filtering out bot account's own comment");
        continue;
      }

      events.push({
        commentId,
        mediaId,
        text,
        commenterId,
        commenterUsername,
        parentId,
        commentedAt: entryTime,
        receivedAt: new Date(),
      });
    }
  }

  return events;
}
