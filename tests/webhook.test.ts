import { describe, it, expect } from "vitest";
import app from "../src/index";
import { computeHmacSha256Hex, constantTimeEqual, verifyWebhookSignature } from "../src/lib/crypto";
import { normalizeWebhookPayload } from "../src/services/normalizer";

const TEST_SECRET = "test_meta_app_secret_123456789";
const TEST_VERIFY_TOKEN = "my_custom_random_verify_token_999";
const TEST_OWN_USER_ID = "17841400000000001";

const mockEnv = {
  DB: {} as D1Database,
  ASSETS: {} as Fetcher,
  META_APP_SECRET: TEST_SECRET,
  META_VERIFY_TOKEN: TEST_VERIFY_TOKEN,
  IG_BUSINESS_ACCOUNT_ID: TEST_OWN_USER_ID,
  ENFORCE_WEBHOOK_SIGNATURE: "true",
};

describe("Phase 2 Webhook Routes", () => {
  describe("GET /webhook (Meta verification handshake)", () => {
    it("returns challenge as plain text with 200 on valid token & subscribe mode", async () => {
      const challenge = "1158201244";
      const res = await app.request(
        `/webhook?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=${challenge}`,
        {},
        mockEnv
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const text = await res.text();
      expect(text).toBe(challenge);
    });

    it("returns 403 when verify token does not match", async () => {
      const res = await app.request(
        `/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=1234`,
        {},
        mockEnv
      );

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toBe("Forbidden");
    });

    it("returns 403 when hub.mode is not 'subscribe'", async () => {
      const res = await app.request(
        `/webhook?hub.mode=unsubscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=1234`,
        {},
        mockEnv
      );

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toBe("Forbidden");
    });

    it("returns 403 when parameters are missing", async () => {
      const res = await app.request(`/webhook`, {}, mockEnv);
      expect(res.status).toBe(403);
    });
  });

  describe("POST /webhook (HMAC signature verification & event handling)", () => {
    it("rejects request with 401 when X-Hub-Signature-256 header is missing", async () => {
      const res = await app.request(
        "/webhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ object: "instagram" }),
        },
        mockEnv
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects request with 401 when signature is invalid", async () => {
      const res = await app.request(
        "/webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
          },
          body: JSON.stringify({ object: "instagram" }),
        },
        mockEnv
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 200 immediately with { received: true } on valid HMAC signature", async () => {
      const payloadObj = {
        object: "instagram",
        entry: [
          {
            id: TEST_OWN_USER_ID,
            time: 1717000000,
            changes: [
              {
                field: "comments",
                value: {
                  id: "comment_123",
                  text: "Link please!",
                  from: {
                    id: "user_456",
                    username: "cool_user",
                  },
                  media: {
                    id: "reel_789",
                    media_product_type: "REELS",
                  },
                },
              },
            ],
          },
        ],
      };

      const rawJson = JSON.stringify(payloadObj);
      const rawBytes = new TextEncoder().encode(rawJson);
      const hash = await computeHmacSha256Hex(TEST_SECRET, rawBytes);
      const signatureHeader = `sha256=${hash}`;

      const res = await app.request(
        "/webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hub-signature-256": signatureHeader,
          },
          body: rawJson,
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { received: boolean };
      expect(body.received).toBe(true);
    });

    it("returns 400 when request body contains malformed JSON", async () => {
      const malformedBody = "{ invalid json string ";
      const rawBytes = new TextEncoder().encode(malformedBody);
      const hash = await computeHmacSha256Hex(TEST_SECRET, rawBytes);

      const res = await app.request(
        "/webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hub-signature-256": `sha256=${hash}`,
          },
          body: malformedBody,
        },
        mockEnv
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Malformed JSON payload");
    });
  });

  describe("Normalizer & Filter Tests", () => {
    it("extracts valid top-level comments", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: TEST_OWN_USER_ID,
            time: 1717000000,
            changes: [
              {
                field: "comments",
                value: {
                  id: "c_1",
                  text: "Send me the recipe!",
                  from: { id: "u_1", username: "chef_john" },
                  media: { id: "m_1", media_product_type: "REELS" },
                },
              },
            ],
          },
        ],
      };

      const events = normalizeWebhookPayload(payload, TEST_OWN_USER_ID);
      expect(events).toHaveLength(1);
      expect(events[0].commentId).toBe("c_1");
      expect(events[0].mediaId).toBe("m_1");
      expect(events[0].text).toBe("Send me the recipe!");
      expect(events[0].commenterId).toBe("u_1");
      expect(events[0].commenterUsername).toBe("chef_john");
      expect(events[0].parentId).toBeNull();
    });

    it("filters out reply comments (has parent_id)", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: TEST_OWN_USER_ID,
            changes: [
              {
                field: "comments",
                value: {
                  id: "c_reply",
                  text: "Thanks for replying!",
                  parent_id: "c_parent_123",
                  from: { id: "u_2", username: "user_two" },
                  media: { id: "m_1" },
                },
              },
            ],
          },
        ],
      };

      const events = normalizeWebhookPayload(payload, TEST_OWN_USER_ID);
      expect(events).toHaveLength(0);
    });

    it("filters out empty comment text", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: TEST_OWN_USER_ID,
            changes: [
              {
                field: "comments",
                value: {
                  id: "c_empty",
                  text: "   ",
                  from: { id: "u_3", username: "user_three" },
                  media: { id: "m_1" },
                },
              },
            ],
          },
        ],
      };

      const events = normalizeWebhookPayload(payload, TEST_OWN_USER_ID);
      expect(events).toHaveLength(0);
    });

    it("filters out account owner's own comments", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: TEST_OWN_USER_ID,
            changes: [
              {
                field: "comments",
                value: {
                  id: "c_own",
                  text: "Check out my new video!",
                  from: { id: TEST_OWN_USER_ID, username: "bot_owner" },
                  media: { id: "m_1" },
                },
              },
            ],
          },
        ],
      };

      const events = normalizeWebhookPayload(payload, TEST_OWN_USER_ID);
      expect(events).toHaveLength(0);
    });

    it("safely ignores non-comments fields (e.g. story_insights, messages)", () => {
      const payload = {
        object: "instagram",
        entry: [
          {
            id: TEST_OWN_USER_ID,
            changes: [
              {
                field: "story_insights",
                value: { impressions: 100 },
              },
            ],
          },
        ],
      };

      const events = normalizeWebhookPayload(payload, TEST_OWN_USER_ID);
      expect(events).toHaveLength(0);
    });
  });

  describe("Web Crypto Security Primitives", () => {
    it("constantTimeEqual returns true for equal strings", () => {
      expect(constantTimeEqual("secret_hash_value", "secret_hash_value")).toBe(true);
    });

    it("constantTimeEqual returns false for different strings and different lengths", () => {
      expect(constantTimeEqual("secret_hash_value", "secret_hash_valux")).toBe(false);
      expect(constantTimeEqual("secret_hash_value", "short")).toBe(false);
    });

    it("verifyWebhookSignature correctly validates valid and invalid signatures", async () => {
      const body = new TextEncoder().encode("hello webhook");
      const hex = await computeHmacSha256Hex("key123", body);

      const valid = await verifyWebhookSignature(body, `sha256=${hex}`, "key123");
      expect(valid).toBe(true);

      const invalidKey = await verifyWebhookSignature(body, `sha256=${hex}`, "wrong_key");
      expect(invalidKey).toBe(false);

      const badHeader = await verifyWebhookSignature(body, "sha1=1234", "key123");
      expect(badHeader).toBe(false);
    });
  });
});
