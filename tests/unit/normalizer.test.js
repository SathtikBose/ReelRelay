const { normalizeWebhookPayload } = require("../../src/services/normalizer");
const commentFixture = require("../fixtures/commentPayload.json");
const replyFixture = require("../fixtures/replyPayload.json");
const ownCommentFixture = require("../fixtures/ownCommentPayload.json");
const malformedFixture = require("../fixtures/malformedPayload.json");

describe("Webhook Normalizer & Ignore Filters", () => {
  const ownUserId = "17841400000000000";

  it("extracts and normalizes standard comment events", () => {
    const events = normalizeWebhookPayload(commentFixture, ownUserId);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      commentId: "comment_1001",
      mediaId: "17890123456789012",
      text: "LINK please",
      commenterId: "user_2001",
      commenterUsername: "superfan",
      parentId: null,
    });
    expect(events[0].commentedAt).toBeInstanceOf(Date);
    expect(events[0].receivedAt).toBeInstanceOf(Date);
  });

  it("filters out comment replies (parent_id present)", () => {
    const events = normalizeWebhookPayload(replyFixture, ownUserId);
    expect(events).toHaveLength(0);
  });

  it("filters out own comments from the account owner", () => {
    const events = normalizeWebhookPayload(ownCommentFixture, ownUserId);
    expect(events).toHaveLength(0);
  });

  it("filters out empty or whitespace-only comments", () => {
    const emptyPayload = {
      object: "instagram",
      entry: [
        {
          id: ownUserId,
          time: 1760000000,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_empty",
                text: "   ",
                from: { id: "user_other", username: "user_other" },
                media: { id: "123" },
              },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(emptyPayload, ownUserId);
    expect(events).toHaveLength(0);
  });

  it("ignores non-comment changes", () => {
    const storyPayload = {
      object: "instagram",
      entry: [
        {
          id: ownUserId,
          time: 1760000000,
          changes: [
            {
              field: "story_insights",
              value: { impression_count: 50 },
            },
          ],
        },
      ],
    };

    const events = normalizeWebhookPayload(storyPayload, ownUserId);
    expect(events).toHaveLength(0);
  });

  it("safely handles malformed payloads without throwing", () => {
    expect(() => normalizeWebhookPayload(malformedFixture, ownUserId)).not.toThrow();
    expect(normalizeWebhookPayload(malformedFixture, ownUserId)).toEqual([]);
    expect(normalizeWebhookPayload(null, ownUserId)).toEqual([]);
    expect(normalizeWebhookPayload({}, ownUserId)).toEqual([]);
  });
});
