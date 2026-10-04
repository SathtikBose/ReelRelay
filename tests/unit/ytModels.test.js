const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { YtVideoRule, DEFAULT_REPLY_VARIANTS } = require("../../src/models/YtVideoRule");
const { YtReplyLog } = require("../../src/models/YtReplyLog");
const { YtCredential } = require("../../src/models/YtCredential");
const { YtState } = require("../../src/models/YtState");

describe("YouTube Mongoose Models & Schema Validation (Phase Y2)", () => {
  let mongoServer;

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
    await YtCredential.deleteMany({});
    await YtState.deleteMany({});
  });

  describe("YtVideoRule Model", () => {
    it("creates a valid video rule and sets default values", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        keywords: ["LINK", " song "],
        link: "https://example.com/rickroll",
      });

      expect(rule._id).toBeDefined();
      expect(rule.videoId).toBe("dQw4w9WgXcQ");
      expect(rule.keywords).toEqual(["link", "song"]);
      expect(rule.matchMode).toBe("word");
      expect(rule.active).toBe(true);
      expect(rule.backfill).toBe(false);
      expect(rule.replyVariants).toEqual(DEFAULT_REPLY_VARIANTS);
      expect(rule.stats.matched).toBe(0);
      expect(rule.stats.replied).toBe(0);
    });

    it("enforces unique videoId constraint", async () => {
      await YtVideoRule.create({
        videoId: "uniqueVid01",
        keywords: ["link"],
        link: "https://example.com",
      });

      await expect(
        YtVideoRule.create({
          videoId: "uniqueVid01",
          keywords: ["guide"],
          link: "https://example.com/other",
        })
      ).rejects.toThrow();
    });

    it("rejects videoId with invalid format or length", async () => {
      const invalidShort = new YtVideoRule({
        videoId: "too_short",
        keywords: ["link"],
        link: "https://example.com",
      });
      await expect(invalidShort.validate()).rejects.toThrow(/11 characters/);

      const invalidChars = new YtVideoRule({
        videoId: "invalid*id!",
        keywords: ["link"],
        link: "https://example.com",
      });
      await expect(invalidChars.validate()).rejects.toThrow(/11 characters/);
    });

    it("rejects non-https destination link", async () => {
      const insecure = new YtVideoRule({
        videoId: "validVid001",
        keywords: ["link"],
        link: "http://insecure-site.com",
      });
      await expect(insecure.validate()).rejects.toThrow(/HTTPS/);
    });

    it("rejects empty keywords array or more than 10 keywords", async () => {
      const emptyKeywords = new YtVideoRule({
        videoId: "validVid002",
        keywords: [],
        link: "https://example.com",
      });
      await expect(emptyKeywords.validate()).rejects.toThrow(/between 1 and 10 keywords/);

      const tooMany = new YtVideoRule({
        videoId: "validVid003",
        keywords: ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10", "k11"],
        link: "https://example.com",
      });
      await expect(tooMany.validate()).rejects.toThrow(/between 1 and 10 keywords/);
    });
  });

  describe("YtReplyLog Model", () => {
    it("creates a valid reply log document with default values", async () => {
      const log = await YtReplyLog.create({
        commentId: "UgzTestCommentId12345",
        videoId: "validVid001",
        authorChannelId: "UC123456789",
        authorName: "Test Commenter",
        commentText: "Send me the link please!",
        matchedKeyword: "link",
        status: "processing",
      });

      expect(log._id).toBeDefined();
      expect(log.commentId).toBe("UgzTestCommentId12345");
      expect(log.attempts).toBe(0);
      expect(log.status).toBe("processing");
    });

    it("enforces unique commentId constraint for idempotency", async () => {
      await YtReplyLog.create({
        commentId: "UgzDupeComment1",
        videoId: "validVid001",
      });

      await expect(
        YtReplyLog.create({
          commentId: "UgzDupeComment1",
          videoId: "validVid001",
        })
      ).rejects.toThrow();
    });

    it("truncates commentText to 300 characters", async () => {
      const longComment = "a".repeat(450);
      const log = await YtReplyLog.create({
        commentId: "UgzLongComment1",
        videoId: "validVid001",
        commentText: longComment,
      });

      expect(log.commentText.length).toBe(300);
    });

    it("enforces valid status enum values", async () => {
      const invalidStatus = new YtReplyLog({
        commentId: "UgzInvalidStatus",
        videoId: "validVid001",
        status: "invalid_status",
      });
      await expect(invalidStatus.validate()).rejects.toThrow(/Status must be one of/);
    });
  });

  describe("YtCredential Model", () => {
    it("creates a valid credential singleton with encrypted token fields", async () => {
      const cred = await YtCredential.create({
        key: "youtube",
        channelId: "UCChannel123",
        channelTitle: "My Awesome YouTube Channel",
        uploadsPlaylistId: "UUChannel123",
        refreshCipher: "mock_cipher_text",
        refreshIv: "mock_iv_hex",
        refreshTag: "mock_tag_hex",
        scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
        status: "connected",
      });

      expect(cred.key).toBe("youtube");
      expect(cred.channelTitle).toBe("My Awesome YouTube Channel");
      expect(cred.status).toBe("connected");
    });

    it("enforces unique key constraint (singleton)", async () => {
      await YtCredential.create({
        key: "youtube",
        refreshCipher: "cipher1",
        refreshIv: "iv1",
        refreshTag: "tag1",
      });

      await expect(
        YtCredential.create({
          key: "youtube",
          refreshCipher: "cipher2",
          refreshIv: "iv2",
          refreshTag: "tag2",
        })
      ).rejects.toThrow();
    });
  });

  describe("YtState Model", () => {
    it("creates a valid YouTube state singleton with defaults", async () => {
      const state = await YtState.create({
        key: "youtube",
        quotaDayKey: "2026-10-04",
        quotaUsed: 150,
      });

      expect(state.key).toBe("youtube");
      expect(state.quotaUsed).toBe(150);
      expect(state.lastPollStatus).toBe("idle");
      expect(state.lastPollSummary).toEqual({
        rules: 0,
        comments: 0,
        replies: 0,
        errors: 0,
      });
    });
  });
});
