const { z } = require("zod");
const { env } = require("../config/env");
const { logger } = require("../lib/logger");

const commentChangeValueSchema = z.object({
  id: z.string().min(1),
  text: z.string().optional().default(""),
  from: z
    .object({
      id: z.string().min(1),
      username: z.string().optional().default(""),
    })
    .optional(),
  media: z
    .object({
      id: z.string().min(1),
      media_product_type: z.string().optional(),
    })
    .optional(),
  parent_id: z.string().optional(),
});

const webhookEntryChangeSchema = z.object({
  field: z.string(),
  value: z.record(z.unknown()),
});

const webhookEntrySchema = z.object({
  id: z.string().optional(),
  time: z.number().optional(),
  changes: z.array(webhookEntryChangeSchema).optional().default([]),
});

const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(webhookEntrySchema).optional().default([]),
});

/**
 * @typedef {Object} CommentEvent
 * @property {string} commentId
 * @property {string} mediaId
 * @property {string} text
 * @property {string} commenterId
 * @property {string} commenterUsername
 * @property {string | null} parentId
 * @property {Date} commentedAt
 * @property {Date} receivedAt
 */

/**
 * Normalizes raw Instagram webhook payload into valid, filtered CommentEvent objects
 * @param {unknown} payload
 * @param {string} [ownUserId=env.IG_USER_ID]
 * @returns {CommentEvent[]} Array of action-ready comment events
 */
function normalizeWebhookPayload(payload, ownUserId = env.IG_USER_ID) {
  const parseResult = webhookPayloadSchema.safeParse(payload);

  if (!parseResult.success) {
    logger.warn({ issues: parseResult.error.issues }, "Ignoring webhook payload with unexpected schema");
    return [];
  }

  const { data } = parseResult;
  if (data.object !== "instagram") {
    logger.debug({ object: data.object }, "Ignoring non-instagram webhook object");
    return [];
  }

  const events = [];

  for (const entry of data.entry) {
    const entryTime = typeof entry.time === "number" ? new Date(entry.time * 1000) : new Date();

    for (const change of entry.changes) {
      if (change.field !== "comments") {
        continue;
      }

      const valResult = commentChangeValueSchema.safeParse(change.value);
      if (!valResult.success) {
        logger.warn({ issues: valResult.error.issues }, "Ignoring invalid comments change structure");
        continue;
      }

      const commentVal = valResult.data;
      const commentId = commentVal.id;
      const mediaId = commentVal.media?.id || "";
      const text = commentVal.text ? commentVal.text.trim() : "";
      const commenterId = commentVal.from?.id || "";
      const commenterUsername = commentVal.from?.username || "";
      const parentId = commentVal.parent_id || null;

      // Filter 1: Empty text
      if (!text) {
        logger.debug({ commentId }, "Filtering out empty comment text");
        continue;
      }

      // Filter 2: Reply comments (parent_id present)
      if (parentId) {
        logger.debug({ commentId, parentId }, "Filtering out reply comment");
        continue;
      }

      // Filter 3: Own comments (from account owner)
      if (ownUserId && commenterId === ownUserId) {
        logger.debug({ commentId, commenterId }, "Filtering out own comment from account owner");
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

module.exports = {
  normalizeWebhookPayload,
  webhookPayloadSchema,
};
