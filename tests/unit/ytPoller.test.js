const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtState } = require("../../src/models/YtState");
const poller = require("../../src/services/youtube/poller");
const ytClient = require("../../src/services/youtube/ytClient");
const quotaService = require("../../src/services/youtube/quotaService");
const credentialService = require("../../src/services/youtube/credentialService");
const pipeline = require("../../src/services/youtube/pipeline");
const { env } = require("../../src/config/env");

jest.mock("../../src/services/youtube/ytClient");
jest.mock("../../src/services/youtube/credentialService");
jest.mock("../../src/services/youtube/quotaService");
jest.mock("../../src/services/youtube/pipeline");

describe("YouTube Poller (Phase Y4)", () => {
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
    await YtState.deleteMany({});
    jest.clearAllMocks();

    env.YT_ENABLED = true;
    env.YT_POLL_ENABLED = true;

    credentialService.getStatus.mockResolvedValue({
      connected: true,
      channelId: "UC_MyChannel_123",
      channelTitle: "My Channel",
    });
    credentialService.getAccessToken.mockResolvedValue("mock_access_token_abc");

    quotaService.getQuotaStatus.mockResolvedValue({
      isExceeded: false,
      dailyQuotaUsed: 100,
      dailyQuotaLimit: 10000,
    });
    quotaService.checkQuotaAvailable.mockResolvedValue(true);
    quotaService.addQuotaUsage.mockResolvedValue();

    pipeline.processDeferredQueue.mockResolvedValue({ processed: 0, posted: 0, deferred: 0, failed: 0 });
    pipeline.processComment.mockResolvedValue({ status: "posted" });

    // Seed state
    await YtState.create({ key: "youtube" });
  });

  describe("calculateAdaptiveIntervalMs", () => {
    it("returns 3 minutes (180000ms) for videos published < 48 hours ago", () => {
      const publishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const interval = poller.calculateAdaptiveIntervalMs(publishedAt);
      expect(interval).toBe(3 * 60 * 1000);
    });

    it("returns 15 minutes (900000ms) for videos published < 7 days ago", () => {
      const publishedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago
      const interval = poller.calculateAdaptiveIntervalMs(publishedAt);
      expect(interval).toBe(15 * 60 * 1000);
    });

    it("returns 60 minutes (3600000ms) for videos published >= 7 days ago", () => {
      const publishedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const interval = poller.calculateAdaptiveIntervalMs(publishedAt);
      expect(interval).toBe(60 * 60 * 1000);
    });

    it("returns default 15 minutes if publishedAt is undefined", () => {
      const interval = poller.calculateAdaptiveIntervalMs(null);
      expect(interval).toBe(15 * 60 * 1000);
    });
  });

  describe("acquirePollLock & releasePollLock", () => {
    it("acquires lock and blocks subsequent acquire calls until released", async () => {
      const firstAcquired = await poller.acquirePollLock();
      expect(firstAcquired).toBe(true);

      // Second attempt while locked
      const secondAcquired = await poller.acquirePollLock();
      expect(secondAcquired).toBe(false);

      // Release lock
      await poller.releasePollLock({ status: "ok", rules: 2, comments: 5, replies: 2, errors: 0 });

      const state = await YtState.findOne({ key: "youtube" });
      expect(state.lockUntil).toBeNull();
      expect(state.lastPollStatus).toBe("ok");
      expect(state.lastPollSummary.replies).toBe(2);

      // Third attempt after release succeeds
      const thirdAcquired = await poller.acquirePollLock();
      expect(thirdAcquired).toBe(true);
    });
  });

  describe("pollOnce", () => {
    it("skips if YT_POLL_ENABLED is false", async () => {
      env.YT_POLL_ENABLED = false;
      const res = await poller.pollOnce();
      expect(res).toEqual({ skipped: true, reason: "disabled" });
    });

    it("skips if YouTube channel is not connected", async () => {
      credentialService.getStatus.mockResolvedValue({ connected: false });
      const res = await poller.pollOnce();
      expect(res).toEqual({ skipped: true, reason: "not_connected" });
    });

    it("skips if daily quota is exceeded", async () => {
      quotaService.getQuotaStatus.mockResolvedValue({ isExceeded: true, quotaExceededUntil: new Date() });
      const res = await poller.pollOnce();
      expect(res).toEqual({ skipped: true, reason: "quota_exceeded" });
    });

    it("executes deferred queue and polls active due rules", async () => {
      await YtVideoRule.create({
        videoId: "dQw4w9WgXc1",
        title: "Due Video",
        keywords: ["link"],
        replyVariants: ["Here is link: {{link}}"],
        link: "https://example.com/due",
        active: true,
        cursor: {
          lastSeenAt: new Date(Date.now() - 60 * 60 * 1000),
          nextPollAt: new Date(Date.now() - 1000), // in the past -> due
        },
      });

      // Non-due rule (nextPollAt in the future)
      await YtVideoRule.create({
        videoId: "dQw4w9WgXc2",
        title: "Future Video",
        keywords: ["link"],
        replyVariants: ["Here is link: {{link}}"],
        link: "https://example.com/future",
        active: true,
        cursor: {
          lastSeenAt: new Date(),
          nextPollAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      ytClient.listCommentThreads.mockResolvedValue({
        items: [
          {
            id: "comment_due_1",
            snippet: {
              videoId: "dQw4w9WgXc1",
              topLevelComment: {
                id: "comment_due_1",
                snippet: {
                  textOriginal: "send link please",
                  authorDisplayName: "Alice",
                  authorChannelId: { value: "UC_Alice" },
                  publishedAt: new Date().toISOString(),
                },
              },
            },
          },
        ],
      });

      const res = await poller.pollOnce();
      expect(res.status).toBe("ok");
      expect(res.summary.rules).toBe(1); // Only the 1 due rule was processed
      expect(pipeline.processDeferredQueue).toHaveBeenCalledTimes(1);
      expect(pipeline.processComment).toHaveBeenCalledTimes(1);
    });
  });

  describe("pollRule", () => {
    it("fetches comment threads, filters by lastSeenAt cursor, sorts oldest first, and updates cursor", async () => {
      const lastSeenAt = new Date("2026-10-04T07:00:00.000Z");
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXc3",
        title: "Order Test Video",
        keywords: ["link"],
        replyVariants: ["Link: {{link}}"],
        link: "https://example.com",
        active: true,
        publishedAt: new Date("2026-10-04T00:00:00.000Z"), // < 48h -> 3m interval
        cursor: {
          lastSeenAt,
          nextPollAt: new Date(),
        },
      });

      // Return comments with 3 timestamps (2 newer than lastSeenAt, 1 older)
      // Comments from YouTube API are newest-first
      ytClient.listCommentThreads.mockResolvedValue({
        items: [
          {
            id: "c_newest_3",
            snippet: {
              videoId: "dQw4w9WgXc3",
              topLevelComment: {
                snippet: {
                  textOriginal: "send link 3",
                  authorDisplayName: "Charlie",
                  authorChannelId: { value: "UC_Charlie" },
                  publishedAt: "2026-10-04T08:00:00.000Z",
                },
              },
            },
          },
          {
            id: "c_middle_2",
            snippet: {
              videoId: "dQw4w9WgXc3",
              topLevelComment: {
                snippet: {
                  textOriginal: "send link 2",
                  authorDisplayName: "Bob",
                  authorChannelId: { value: "UC_Bob" },
                  publishedAt: "2026-10-04T07:30:00.000Z",
                },
              },
            },
          },
          {
            id: "c_old_1",
            snippet: {
              videoId: "dQw4w9WgXc3",
              topLevelComment: {
                snippet: {
                  textOriginal: "send link 1 (older than cursor)",
                  authorDisplayName: "Alice",
                  authorChannelId: { value: "UC_Alice" },
                  publishedAt: "2026-10-04T06:50:00.000Z", // Older than lastSeenAt
                },
              },
            },
          },
        ],
      });

      const processedOrder = [];
      pipeline.processComment.mockImplementation(async (comment) => {
        processedOrder.push(comment.commentId);
        return { status: "posted" };
      });

      const result = await poller.pollRule(rule, "access_token", "UC_MyChannel_123");

      // 2 comments collected (c_old_1 was skipped and stopped cursor)
      expect(result.comments).toBe(2);
      expect(result.replies).toBe(2);

      // Processed in OLDEST FIRST order: c_middle_2 (07:30) then c_newest_3 (08:00)
      expect(processedOrder).toEqual(["c_middle_2", "c_newest_3"]);

      // Rule cursor updated
      const updatedRule = await YtVideoRule.findById(rule._id);
      expect(updatedRule.cursor.lastSeenAt.toISOString()).toBe("2026-10-04T08:00:00.000Z");
      expect(updatedRule.cursor.nextPollAt).toBeDefined();
    });

    it("deactivates rule if YouTube returns commentsDisabled", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXc4",
        title: "Disabled Video",
        keywords: ["link"],
        replyVariants: ["Link: {{link}}"],
        link: "https://example.com",
        active: true,
        cursor: {
          lastSeenAt: new Date(),
        },
      });

      const disabledErr = new Error("The video identified by the videoId parameter has disabled comments.");
      disabledErr.ytReason = "commentsDisabled";
      ytClient.listCommentThreads.mockRejectedValue(disabledErr);

      await expect(poller.pollRule(rule, "access_token", "UC_MyChannel_123")).rejects.toThrow(
        "disabled comments"
      );

      const updatedRule = await YtVideoRule.findById(rule._id);
      expect(updatedRule.active).toBe(false);
    });
  });
});
