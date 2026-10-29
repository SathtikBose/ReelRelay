import { describe, it, expect, beforeEach } from "vitest";
import { createTestD1 } from "./createTestD1";
import {
  createKeywordRule,
  getKeywordRules,
  getKeywordRuleById,
  getKeywordRuleByMediaId,
  updateKeywordRule,
  toggleKeywordRule,
  deleteKeywordRule,
  incrementRuleStats,
  claimCommentForProcessing,
  hasUserReceivedDmForReel,
  updateCommentStatus,
  getProcessedComments,
  cleanupOldRecords,
} from "../src/lib/db";
import { matchComment, normalizeText, parseKeywordList } from "../src/services/matcher";

describe("Phase 3 D1 Database & Keyword Matching", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createTestD1();
  });

  describe("Keyword Matching Engine", () => {
    it("matches case-insensitively and handles trimmed inputs", () => {
      const keywords = "  LiNK  ,  GuIdE  ";
      expect(matchComment("Please send me the link!", keywords, "word")).toBe("link");
      expect(matchComment("CAN I GET THE GUIDE?", keywords, "word")).toBe("guide");
    });

    it("handles word match mode (default)", () => {
      const keywords = "deal, pro";
      // Exact word in sentence -> match
      expect(matchComment("What a great deal today!", keywords, "word")).toBe("deal");
      expect(matchComment("This is for a pro user", keywords, "word")).toBe("pro");

      // Substrings embedded in longer words should NOT match in word mode
      expect(matchComment("This is idealistic", keywords, "word")).toBeNull();
      expect(matchComment("Professional development", keywords, "word")).toBeNull();
    });

    it("handles contains match mode", () => {
      const keywords = "code";
      expect(matchComment("mycouponcodehere", keywords, "contains")).toBe("code");
      expect(matchComment("no match here", keywords, "contains")).toBeNull();
    });

    it("handles exact match mode (ignoring external punctuation and emojis)", () => {
      const keywords = "recipe";
      // Exact word with punctuation or emoji -> matches
      expect(matchComment("Recipe!", keywords, "exact")).toBe("recipe");
      expect(matchComment("recipe 👍", keywords, "exact")).toBe("recipe");

      // Additional text should NOT match in exact mode
      expect(matchComment("I love this recipe so much", keywords, "exact")).toBeNull();
    });

    it("parseKeywordList cleans, trims, and deduplicates keywords", () => {
      const list = parseKeywordList("  link, LINK , PDF,  pdf \n guide ");
      expect(list).toEqual(["link", "pdf", "guide"]);
    });
  });

  describe("D1 Database CRUD for Keywords", () => {
    it("creates, retrieves, updates, toggles, and deletes a keyword rule", async () => {
      // 1. Create
      const created = await createKeywordRule(db, {
        mediaId: "17998877665544332",
        keyword: "ebook, guide",
        matchMode: "word",
        link: "https://example.com/free-guide",
        dmMessage: "Hey {{username}}, here is your ebook:\n{{link}}",
        caption: "Top 5 tips for coding!",
      });

      expect(created.id).toBeDefined();
      expect(created.media_id).toBe("17998877665544332");
      expect(created.keyword).toBe("ebook, guide");
      expect(created.active).toBe(1);

      // 2. Retrieve by ID and by Media ID
      const byId = await getKeywordRuleById(db, created.id);
      expect(byId?.id).toBe(created.id);

      const byMediaId = await getKeywordRuleByMediaId(db, "17998877665544332");
      expect(byMediaId?.id).toBe(created.id);

      // 3. Update
      const updated = await updateKeywordRule(db, created.id, {
        link: "https://example.com/updated-guide",
        keyword: "cheatsheet",
      });
      expect(updated?.link).toBe("https://example.com/updated-guide");
      expect(updated?.keyword).toBe("cheatsheet");

      // 4. Toggle active status
      const toggledToInactive = await toggleKeywordRule(db, created.id);
      expect(toggledToInactive).toBe(true);
      const paused = await getKeywordRuleById(db, created.id);
      expect(paused?.active).toBe(0);

      // Toggle back to active
      await toggleKeywordRule(db, created.id);
      const activeAgain = await getKeywordRuleById(db, created.id);
      expect(activeAgain?.active).toBe(1);

      // 5. Increment stats
      await incrementRuleStats(db, created.id, "matched");
      await incrementRuleStats(db, created.id, "sent");
      const withStats = await getKeywordRuleById(db, created.id);
      expect(withStats?.matched_count).toBe(1);
      expect(withStats?.sent_count).toBe(1);
      expect(withStats?.failed_count).toBe(0);

      // 6. Delete
      const deleted = await deleteKeywordRule(db, created.id);
      expect(deleted).toBe(true);
      const afterDelete = await getKeywordRuleById(db, created.id);
      expect(afterDelete).toBeNull();
    });

    it("getKeywordRules returns rules in descending order of ID", async () => {
      await createKeywordRule(db, {
        mediaId: "reel_1",
        keyword: "one",
        link: "https://example.com/1",
      });
      await createKeywordRule(db, {
        mediaId: "reel_2",
        keyword: "two",
        link: "https://example.com/2",
      });

      const all = await getKeywordRules(db);
      expect(all).toHaveLength(2);
      expect(all[0].media_id).toBe("reel_2");
      expect(all[1].media_id).toBe("reel_1");
    });
  });

  describe("Comment Deduplication & Processing Log in D1", () => {
    it("claims a comment atomically and rejects duplicate comment IDs", async () => {
      const commentEvent = {
        commentId: "comment_unique_999",
        mediaId: "reel_123",
        commenterId: "user_555",
        commenterUsername: "johndoe",
        text: "Please send link!",
        matchedKeyword: "link",
      };

      // First attempt: should succeed and claim
      const firstClaim = await claimCommentForProcessing(db, commentEvent);
      expect(firstClaim).toBe(true);

      // Second attempt with the SAME commentId: must be rejected as duplicate
      const duplicateClaim = await claimCommentForProcessing(db, commentEvent);
      expect(duplicateClaim).toBe(false);
    });

    it("checks per-user deduplication on a reel", async () => {
      const mediaId = "reel_vip_100";
      const commenterId = "user_sarah_777";

      // Initially, user has received no DMs on this reel
      const initialCheck = await hasUserReceivedDmForReel(db, mediaId, commenterId);
      expect(initialCheck).toBe(false);

      // Claim a comment for this user
      await claimCommentForProcessing(db, {
        commentId: "comment_sarah_1",
        mediaId,
        commenterId,
        commenterUsername: "sarah",
        text: "give me the code",
      });

      // Status is currently 'processing' (not sent yet)
      expect(await hasUserReceivedDmForReel(db, mediaId, commenterId)).toBe(false);

      // Mark the comment as 'sent'
      await updateCommentStatus(db, "comment_sarah_1", {
        status: "sent",
        messageId: "mid.123456",
      });

      // Now user has received a DM for this reel
      const afterSentCheck = await hasUserReceivedDmForReel(db, mediaId, commenterId);
      expect(afterSentCheck).toBe(true);

      // But on a DIFFERENT reel, user is still eligible!
      const differentReelCheck = await hasUserReceivedDmForReel(db, "reel_vip_200", commenterId);
      expect(differentReelCheck).toBe(false);
    });

    it("retrieves paginated comments and performs record cleanup", async () => {
      await claimCommentForProcessing(db, {
        commentId: "c_1",
        mediaId: "m_1",
        commenterId: "u_1",
        commenterUsername: "user1",
        text: "hello",
      });
      await updateCommentStatus(db, "c_1", { status: "sent" });

      const { items, total } = await getProcessedComments(db, 10, 0);
      expect(total).toBe(1);
      expect(items[0].comment_id).toBe("c_1");
      expect(items[0].status).toBe("sent");

      // Cleanup records older than 60 days (current record was created today, so 0 deleted)
      const cleanupRes = await cleanupOldRecords(db, 60);
      expect(cleanupRes.commentsDeleted).toBe(0);
    });
  });
});
