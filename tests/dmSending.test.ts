import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestD1 } from "./createTestD1";
import {
  createKeywordRule,
  getKeywordRuleById,
  getProcessedComments,
  claimCommentForProcessing,
} from "../src/lib/db";
import {
  classifyMetaError,
  sendPrivateReplyDm,
  dispatchCommentReply,
} from "../src/services/instagram";
import { renderTemplate } from "../src/services/template";
import { CommentEvent } from "../src/services/normalizer";

const TEST_TOKEN = "EAAGtesttoken_secret_12345";
const TEST_ACCOUNT_ID = "17841400000000001";

describe("Phase 4 Meta Graph API DM Sending", () => {
  let db: D1Database;

  const mockEnv = {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    META_ACCESS_TOKEN: TEST_TOKEN,
    IG_BUSINESS_ACCOUNT_ID: TEST_ACCOUNT_ID,
    GRAPH_API_VERSION: "v23.0",
  };

  beforeEach(() => {
    db = createTestD1();
    mockEnv.DB = db;
  });

  describe("Template Engine", () => {
    it("renders variables and handles fallbacks", () => {
      const template = "Hey {{username}}! Here is your link for {{keyword}}:\n{{link}}";
      const result = renderTemplate(template, {
        username: "@awesome_dev",
        link: "https://example.com/guide",
        keyword: "ebook",
      });

      expect(result).toBe("Hey awesome_dev! Here is your link for ebook:\nhttps://example.com/guide");
    });

    it("enforces 800 character maximum length", () => {
      const longLink = "https://example.com/" + "a".repeat(1000);
      const result = renderTemplate("Click: {{link}}", { link: longLink });
      expect(result.length).toBeLessThanOrEqual(800);
    });
  });

  describe("Meta Error Classification", () => {
    it("classifies code 190 and auth subcodes as 'auth'", () => {
      expect(classifyMetaError(400, 190, 463)).toBe("auth");
      expect(classifyMetaError(400, 190, 0)).toBe("auth");
    });

    it("classifies rate limits, throttling, and 5xx as 'transient'", () => {
      expect(classifyMetaError(429, 4)).toBe("transient");
      expect(classifyMetaError(400, 17)).toBe("transient");
      expect(classifyMetaError(400, 613)).toBe("transient");
      expect(classifyMetaError(500, 1)).toBe("transient");
      expect(classifyMetaError(503, 2)).toBe("transient");
      expect(classifyMetaError(0, 0, 0, "request timeout")).toBe("transient");
    });

    it("classifies client / invalid parameter errors as 'permanent'", () => {
      expect(classifyMetaError(400, 100)).toBe("permanent");
      expect(classifyMetaError(400, 200)).toBe("permanent");
    });
  });

  describe("sendPrivateReplyDm", () => {
    it("makes request to correct Graph API version URL with payload", async () => {
      let calledUrl = "";
      let calledMethod = "";
      let calledAuth = "";
      let calledBody = "";

      const mockFetch = vi.fn(async (url: any, init: any) => {
        calledUrl = String(url);
        calledMethod = init.method;
        calledAuth = init.headers.Authorization;
        calledBody = init.body;

        return {
          ok: true,
          status: 200,
          json: async () => ({ message_id: "m_abc_123" }),
        } as Response;
      });

      const result = await sendPrivateReplyDm({
        commentId: "c_test_99",
        text: "Here is your link!",
        env: mockEnv,
        fetchFn: mockFetch as any,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("m_abc_123");
      expect(calledUrl).toBe(`https://graph.facebook.com/v23.0/${TEST_ACCOUNT_ID}/messages`);
      expect(calledMethod).toBe("POST");
      expect(calledAuth).toBe(`Bearer ${TEST_TOKEN}`);

      const parsedBody = JSON.parse(calledBody);
      expect(parsedBody).toEqual({
        recipient: { comment_id: "c_test_99" },
        message: { text: "Here is your link!" },
      });
    });

    it("sanitizes Meta tokens out of error messages", async () => {
      const mockFetch = vi.fn(async () => {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              message: `Invalid OAuth access token: ${TEST_TOKEN}`,
              code: 190,
            },
          }),
        } as Response;
      });

      const result = await sendPrivateReplyDm({
        commentId: "c_err",
        text: "hello",
        env: mockEnv,
        fetchFn: mockFetch as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).not.toContain(TEST_TOKEN);
      expect(result.error).toContain("[REDACTED_META_TOKEN]");
      expect(result.errorType).toBe("auth");
    });
  });

  describe("dispatchCommentReply Pipeline", () => {
    it("enforces Meta's 7-day policy cutoff", async () => {
      const rule = await createKeywordRule(db, {
        mediaId: "reel_old",
        keyword: "link",
        link: "https://example.com/guide",
      });

      // Comment from 8 days ago
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const oldEvent: CommentEvent = {
        commentId: "c_expired_8d",
        mediaId: "reel_old",
        commenterId: "user_old",
        commenterUsername: "olduser",
        text: "give me the link",
        parentId: null,
        commentedAt: eightDaysAgo,
        receivedAt: new Date(),
      };

      const result = await dispatchCommentReply(oldEvent, rule, mockEnv);
      expect(result.status).toBe("skipped");
      expect(result.reason).toBe("expired_7_days");

      // Verify rule stats: sent count was not incremented
      const refreshedRule = await getKeywordRuleById(db, rule.id);
      expect(refreshedRule?.sent_count).toBe(0);
    });

    it("sends DM successfully and updates D1 status to 'sent'", async () => {
      const rule = await createKeywordRule(db, {
        mediaId: "reel_active_1",
        keyword: "code",
        link: "https://example.com/code",
        dmMessage: "Hey {{username}}, here is your link: {{link}}",
      });

      const freshEvent: CommentEvent = {
        commentId: "c_fresh_10",
        mediaId: "reel_active_1",
        commenterId: "user_alex",
        commenterUsername: "alex",
        text: "code please",
        parentId: null,
        commentedAt: new Date(),
        receivedAt: new Date(),
      };

      // Claim comment in DB first as the webhook pipeline does
      await claimCommentForProcessing(db, freshEvent);

      const mockFetch = vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ message_id: "mid.sent_ok_123" }),
        } as Response;
      });

      const result = await dispatchCommentReply(freshEvent, rule, mockEnv, mockFetch as any);
      expect(result.status).toBe("sent");
      expect(result.messageId).toBe("mid.sent_ok_123");

      // Verify sent counter incremented in D1
      const updatedRule = await getKeywordRuleById(db, rule.id);
      expect(updatedRule?.sent_count).toBe(1);

      // Verify processed_comments log updated in D1
      const { items } = await getProcessedComments(db, 10, 0);
      const commentLog = items.find((i) => i.comment_id === "c_fresh_10");
      expect(commentLog?.status).toBe("sent");
      expect(commentLog?.message_id).toBe("mid.sent_ok_123");
    });

    it("handles transient failure by retrying once, then failing without infinite loops", async () => {
      const rule = await createKeywordRule(db, {
        mediaId: "reel_transient",
        keyword: "guide",
        link: "https://example.com/guide",
      });

      const event: CommentEvent = {
        commentId: "c_transient_fail",
        mediaId: "reel_transient",
        commenterId: "user_tom",
        commenterUsername: "tom",
        text: "guide please",
        parentId: null,
        commentedAt: new Date(),
        receivedAt: new Date(),
      };

      let attempts = 0;
      const mockFetch = vi.fn(async () => {
        attempts++;
        return {
          ok: false,
          status: 429, // Rate limit
          json: async () => ({ error: { code: 4, message: "Application request limit reached" } }),
        } as Response;
      });

      const result = await dispatchCommentReply(event, rule, mockEnv, mockFetch as any);
      expect(result.status).toBe("failed");
      // Bounded retry: exactly 2 attempts, no infinite loop
      expect(attempts).toBe(2);

      // Verify failed count incremented in D1
      const updatedRule = await getKeywordRuleById(db, rule.id);
      expect(updatedRule?.failed_count).toBe(1);
    });

    it("does not retry on permanent errors", async () => {
      const rule = await createKeywordRule(db, {
        mediaId: "reel_perm",
        keyword: "info",
        link: "https://example.com/info",
      });

      const event: CommentEvent = {
        commentId: "c_perm_fail",
        mediaId: "reel_perm",
        commenterId: "user_blocked",
        commenterUsername: "blocked_user",
        text: "info",
        parentId: null,
        commentedAt: new Date(),
        receivedAt: new Date(),
      };

      let attempts = 0;
      const mockFetch = vi.fn(async () => {
        attempts++;
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { code: 100, message: "User cannot be messaged" } }),
        } as Response;
      });

      const result = await dispatchCommentReply(event, rule, mockEnv, mockFetch as any);
      expect(result.status).toBe("failed");
      // Exactly 1 attempt because it's a permanent error
      expect(attempts).toBe(1);
    });
  });
});
