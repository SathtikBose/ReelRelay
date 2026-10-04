const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { YtReplyLog } = require("../../src/models/YtReplyLog");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtState } = require("../../src/models/YtState");
const { ReplyLog } = require("../../src/models/ReplyLog");
const statsService = require("../../src/services/youtube/statsService");
const quotaService = require("../../src/services/youtube/quotaService");
const credentialService = require("../../src/services/youtube/credentialService");
const { env } = require("../../src/config/env");

jest.mock("../../src/services/youtube/quotaService");
jest.mock("../../src/services/youtube/credentialService");

describe("YouTube Stats Service (Phase Y5)", () => {
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
    await YtReplyLog.deleteMany({});
    await YtVideoRule.deleteMany({});
    await YtState.deleteMany({});
    await ReplyLog.deleteMany({});
    jest.clearAllMocks();

    env.YT_ENABLED = true;
    env.YT_POLL_ENABLED = true;

    credentialService.getStatus.mockResolvedValue({
      connected: true,
      status: "connected",
      channelTitle: "Tech Insights",
      channelId: "UC_TechInsights_123",
    });

    quotaService.getQuotaStatus.mockResolvedValue({
      quotaUsed: 150,
      quotaBudget: 9000,
      dailyLimit: 10000,
      isExceeded: false,
    });

    await YtState.create({
      key: "youtube",
      lastPollAt: new Date(),
      lastPollStatus: "ok",
      lastPollSummary: { rules: 2, comments: 10, replies: 3, errors: 0 },
    });
  });

  describe("getYtDashboardData", () => {
    it("aggregates stats, quota, rules, and last poll data correctly", async () => {
      const now = new Date();
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXc1",
        title: "Test Video 1",
        keywords: ["link"],
        replyVariants: ["Link: {{link}}"],
        link: "https://example.com/1",
        active: true,
      });

      await YtVideoRule.create({
        videoId: "dQw4w9WgXc2",
        title: "Test Video 2",
        keywords: ["code"],
        replyVariants: ["Code: {{link}}"],
        link: "https://example.com/2",
        active: false,
      });

      // Seed logs
      await YtReplyLog.create([
        {
          commentId: "c1",
          videoId: "dQw4w9WgXc1",
          ruleId: rule._id,
          status: "posted",
          processedAt: now,
        },
        {
          commentId: "c2",
          videoId: "dQw4w9WgXc1",
          ruleId: rule._id,
          status: "failed",
          errorMessage: "Network error",
        },
        {
          commentId: "c3",
          videoId: "dQw4w9WgXc1",
          ruleId: rule._id,
          status: "deferred",
          skipReason: "quota_exceeded",
        },
      ]);

      const data = await statsService.getYtDashboardData();

      expect(data.stats.repliedToday).toBe(1);
      expect(data.stats.replied7Days).toBe(1);
      expect(data.stats.failedTotal).toBe(1);
      expect(data.stats.deferredTotal).toBe(1);
      expect(data.stats.activeRules).toBe(1);
      expect(data.stats.totalRules).toBe(2);

      expect(data.lastPoll.status).toBe("ok");
      expect(data.lastPoll.summary.replies).toBe(3);
      expect(data.recentActivity).toHaveLength(3);
    });

    it("generates warning alerts for re-auth and quota exceeded", async () => {
      credentialService.getStatus.mockResolvedValue({
        connected: false,
        status: "needs_reauth",
        lastError: "Token was revoked",
      });

      quotaService.getQuotaStatus.mockResolvedValue({
        quotaUsed: 10000,
        quotaBudget: 9000,
        dailyLimit: 10000,
        isExceeded: true,
      });

      const data = await statsService.getYtDashboardData();
      expect(data.alerts).toHaveLength(2);
      expect(data.alerts[0].type).toBe("danger");
      expect(data.alerts[0].message).toContain("Token was revoked");
      expect(data.alerts[1].type).toBe("warning");
      expect(data.alerts[1].message).toContain("quota budget reached");
    });
  });

  describe("getCombinedRecentActivity", () => {
    it("merges and sorts activity from both Instagram and YouTube by createdAt descending", async () => {
      const t1 = new Date("2026-10-04T10:00:00Z");
      const t2 = new Date("2026-10-04T10:05:00Z");
      const t3 = new Date("2026-10-04T10:10:00Z");

      await ReplyLog.create({
        mediaId: "ig_media_1",
        commentId: "ig_c_1",
        commenterUsername: "ig_user_alpha",
        matchedKeyword: "link",
        status: "sent",
        createdAt: t1,
      });

      await YtReplyLog.create({
        videoId: "dQw4w9WgXc1",
        commentId: "yt_c_1",
        authorName: "yt_viewer_beta",
        matchedKeyword: "code",
        status: "posted",
        createdAt: t3,
      });

      await ReplyLog.create({
        mediaId: "ig_media_2",
        commentId: "ig_c_2",
        commenterUsername: "ig_user_gamma",
        matchedKeyword: "demo",
        status: "failed",
        errorMessage: "IG Graph Error",
        createdAt: t2,
      });

      const combined = await statsService.getCombinedRecentActivity(10);
      expect(combined).toHaveLength(3);

      // Order should be t3 (YouTube), t2 (Instagram), t1 (Instagram)
      expect(combined[0].platform).toBe("youtube");
      expect(combined[0].recipientOrAuthor).toBe("yt_viewer_beta");
      expect(combined[0].status).toBe("posted");

      expect(combined[1].platform).toBe("instagram");
      expect(combined[1].recipientOrAuthor).toBe("ig_user_gamma");
      expect(combined[1].status).toBe("failed");

      expect(combined[2].platform).toBe("instagram");
      expect(combined[2].recipientOrAuthor).toBe("ig_user_alpha");
    });
  });
});
