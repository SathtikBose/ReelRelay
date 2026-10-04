const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const pipeline = require("../../src/services/youtube/pipeline");
const ytClient = require("../../src/services/youtube/ytClient");
const quotaService = require("../../src/services/youtube/quotaService");
const credentialService = require("../../src/services/youtube/credentialService");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtReplyLog } = require("../../src/models/YtReplyLog");
const { YtState } = require("../../src/models/YtState");
const { env } = require("../../src/config/env");
const { YouTubeApiError } = require("../../src/lib/errors");

jest.mock("../../src/services/youtube/ytClient");
jest.mock("../../src/services/youtube/credentialService");

describe("YouTube Reply Pipeline (Phase Y4)", () => {
  let mongoServer;
  let sampleRule;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await YtVideoRule.deleteMany({});
    await YtReplyLog.deleteMany({});
    await YtState.deleteMany({});
    jest.clearAllMocks();

    env.YT_MAX_REPLIES_PER_HOUR = 60;
    env.YT_QUOTA_DAILY_BUDGET = 9000;

    credentialService.getAccessToken.mockResolvedValue("mock_access_token_123");

    sampleRule = await YtVideoRule.create({
      videoId: "dQw4w9WgXcQ",
      title: "Rick Astley",
      keywords: ["link", "guide"],
      link: "https://example.com/rickroll",
      matchMode: "word",
      replyVariants: ["Here is your link: {{link}} @{{author}}"],
      active: true,
    });
  });

  describe("processComment", () => {
    it("skips comments that do not match rule keywords", async () => {
      const event = {
        commentId: "c_nomatch_1",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_1",
        authorName: "Alice",
        commentText: "Great video, I love the background music!",
        publishedAt: new Date(),
      };

      const result = await pipeline.processComment(event, sampleRule, { skipDelay: true });

      expect(result.status).toBe("skipped");
      expect(result.skipReason).toBe("no_match");
      expect(ytClient.insertReply).not.toHaveBeenCalled();

      // No log doc created for no-match
      const log = await YtReplyLog.findOne({ commentId: "c_nomatch_1" });
      expect(log).toBeNull();
    });

    it("successfully matches keyword, posts reply, updates log, stats, and quota", async () => {
      const event = {
        commentId: "c_match_1",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_Alice",
        authorName: "Alice",
        commentText: "Can I please get the link to this?",
        publishedAt: new Date(),
      };

      ytClient.insertReply.mockResolvedValue({
        id: "reply_comment_777",
        textOriginal: "Here is your link: https://example.com/rickroll @Alice",
      });

      const result = await pipeline.processComment(event, sampleRule, { skipDelay: true });

      expect(result.status).toBe("posted");
      expect(result.replyCommentId).toBe("reply_comment_777");
      expect(ytClient.insertReply).toHaveBeenCalledWith(
        "mock_access_token_123",
        "c_match_1",
        "Here is your link: https://example.com/rickroll @Alice"
      );

      // Verify DB Log
      const log = await YtReplyLog.findOne({ commentId: "c_match_1" });
      expect(log).toBeDefined();
      expect(log.status).toBe("posted");
      expect(log.matchedKeyword).toBe("link");
      expect(log.replyCommentId).toBe("reply_comment_777");
      expect(log.quotaCost).toBe(50);

      // Verify Rule Stats
      const updatedRule = await YtVideoRule.findById(sampleRule._id);
      expect(updatedRule.stats.matched).toBe(1);
      expect(updatedRule.stats.replied).toBe(1);

      // Verify Quota Tracker
      const quota = await quotaService.getQuotaStatus();
      expect(quota.quotaUsed).toBe(50);
    });

    it("enforces commentId idempotency when same comment is processed twice", async () => {
      const event = {
        commentId: "c_dupe_1",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_Bob",
        authorName: "Bob",
        commentText: "Send the link please",
        publishedAt: new Date(),
      };

      ytClient.insertReply.mockResolvedValue({ id: "reply_1" });

      const res1 = await pipeline.processComment(event, sampleRule, { skipDelay: true });
      expect(res1.status).toBe("posted");
      expect(ytClient.insertReply).toHaveBeenCalledTimes(1);

      // Second attempt on same commentId
      const res2 = await pipeline.processComment(event, sampleRule, { skipDelay: true });
      expect(res2.status).toBe("skipped");
      expect(res2.skipReason).toBe("already_processed");
      expect(ytClient.insertReply).toHaveBeenCalledTimes(1); // No double reply
    });

    it("skips duplicate replies to the same author on the same video", async () => {
      ytClient.insertReply.mockResolvedValue({ id: "reply_1" });

      const event1 = {
        commentId: "c_author_first",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_RepeatedUser",
        authorName: "Charlie",
        commentText: "Send link 1",
        publishedAt: new Date(),
      };

      const res1 = await pipeline.processComment(event1, sampleRule, { skipDelay: true });
      expect(res1.status).toBe("posted");

      // Same author on another comment on the same video
      const event2 = {
        commentId: "c_author_second",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_RepeatedUser",
        authorName: "Charlie",
        commentText: "Send link 2",
        publishedAt: new Date(),
      };

      const res2 = await pipeline.processComment(event2, sampleRule, { skipDelay: true });
      expect(res2.status).toBe("skipped");
      expect(res2.skipReason).toBe("duplicate_author");
      expect(ytClient.insertReply).toHaveBeenCalledTimes(1);
    });

    it("defers replies when hourly limit is reached", async () => {
      env.YT_MAX_REPLIES_PER_HOUR = 2;
      ytClient.insertReply.mockResolvedValue({ id: "reply_x" });

      // First two succeed
      await pipeline.processComment({ commentId: "c_h_1", videoId: "dQw4w9WgXcQ", authorChannelId: "UC_1", commentText: "link 1" }, sampleRule, { skipDelay: true });
      await pipeline.processComment({ commentId: "c_h_2", videoId: "dQw4w9WgXcQ", authorChannelId: "UC_2", commentText: "link 2" }, sampleRule, { skipDelay: true });

      // Third should be deferred
      const event3 = { commentId: "c_h_3", videoId: "dQw4w9WgXcQ", authorChannelId: "UC_3", commentText: "link 3" };
      const res3 = await pipeline.processComment(event3, sampleRule, { skipDelay: true });

      expect(res3.status).toBe("deferred");
      expect(res3.skipReason).toBe("hourly_cap");

      const log = await YtReplyLog.findOne({ commentId: "c_h_3" });
      expect(log.status).toBe("deferred");
    });

    it("pauses video rule when YouTube API returns commentsDisabled", async () => {
      const event = {
        commentId: "c_disabled_1",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_User",
        authorName: "Dave",
        commentText: "link please",
      };

      const disabledErr = new YouTubeApiError("Comments are disabled", 403, "commentsDisabled", "permanent");
      ytClient.insertReply.mockRejectedValue(disabledErr);

      const res = await pipeline.processComment(event, sampleRule, { skipDelay: true });

      expect(res.status).toBe("failed");
      expect(res.error).toBe("commentsDisabled");

      const updatedRule = await YtVideoRule.findById(sampleRule._id);
      expect(updatedRule.active).toBe(false); // Rule was paused
    });

    it("marks needs_reauth when YouTube API returns auth error", async () => {
      const event = {
        commentId: "c_auth_1",
        videoId: "dQw4w9WgXcQ",
        authorChannelId: "UC_User",
        authorName: "Eve",
        commentText: "link please",
      };

      const authErr = new YouTubeApiError("Token revoked", 401, "invalid_grant", "auth");
      ytClient.insertReply.mockRejectedValue(authErr);

      const res = await pipeline.processComment(event, sampleRule, { skipDelay: true });

      expect(res.status).toBe("failed");
      expect(credentialService.markNeedsReauth).toHaveBeenCalledWith("Token revoked");
    });
  });

  describe("processDeferredQueue", () => {
    it("processes deferred replies that are within 7 days age", async () => {
      await YtReplyLog.create({
        commentId: "c_deferred_old",
        videoId: "dQw4w9WgXcQ",
        ruleId: sampleRule._id,
        authorChannelId: "UC_Old",
        authorName: "Old",
        commentText: "link please",
        matchedKeyword: "link",
        status: "deferred",
        commentedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
      });

      ytClient.insertReply.mockResolvedValue({ id: "reply_deferred_ok" });

      const summary = await pipeline.processDeferredQueue();

      expect(summary.posted).toBe(1);
      const log = await YtReplyLog.findOne({ commentId: "c_deferred_old" });
      expect(log.status).toBe("posted");
    });
  });
});
