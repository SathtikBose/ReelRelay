const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtReplyLog } = require("../../src/models/YtReplyLog");
const { YtState } = require("../../src/models/YtState");
const poller = require("../../src/services/youtube/poller");
const ytClient = require("../../src/services/youtube/ytClient");
const credentialService = require("../../src/services/youtube/credentialService");
const { env } = require("../../src/config/env");

jest.mock("../../src/services/youtube/ytClient");
jest.mock("../../src/services/youtube/credentialService");

describe("YouTube Polling & Pipeline Integration (Phase Y4)", () => {
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
    await YtState.deleteMany({});
    jest.clearAllMocks();

    env.YT_ENABLED = true;
    env.YT_POLL_ENABLED = true;
    env.YT_DAILY_QUOTA_LIMIT = 10000;

    credentialService.getStatus.mockResolvedValue({
      connected: true,
      channelId: "UC_ChannelOwner_123",
      channelTitle: "Master Tech Channel",
    });
    credentialService.getAccessToken.mockResolvedValue("ya29.mock_valid_access_token");

    // Initialize state
    await YtState.create({ key: "youtube" });
  });

  it("runs full end-to-end polling cycle: fetches comments, filters, matches keyword, posts reply, updates log, stats and cursor", async () => {
    const videoId = "dQw4w9WgXcQ";
    const rule = await YtVideoRule.create({
      videoId,
      title: "How to Build an AI Agent",
      keywords: ["code", "link"],
      replyVariants: ["Hey {{author}}, here is your link: {{link}}"],
      link: "https://example.com/ai-agent-tutorial",
      matchMode: "contains",
      active: true,
      publishedAt: new Date("2026-10-04T00:00:00.000Z"),
      cursor: {
        lastSeenAt: new Date("2026-10-04T06:00:00.000Z"),
        nextPollAt: new Date("2026-10-04T06:00:00.000Z"),
      },
    });

    // Mock comments returned from YouTube API (ordered newest to oldest as YouTube returns)
    ytClient.listCommentThreads.mockResolvedValue({
      items: [
        {
          id: "comment_match_new",
          snippet: {
            videoId,
            topLevelComment: {
              id: "comment_match_new",
              snippet: {
                textOriginal: "Awesome video, please share the code and link!",
                authorDisplayName: "Alice Smith",
                authorChannelId: { value: "UC_Alice_Smith_01" },
                publishedAt: "2026-10-04T08:30:00.000Z",
              },
            },
          },
        },
        {
          id: "comment_no_match",
          snippet: {
            videoId,
            topLevelComment: {
              id: "comment_no_match",
              snippet: {
                textOriginal: "Great explanation of algorithms.",
                authorDisplayName: "Bob Jones",
                authorChannelId: { value: "UC_Bob_Jones_02" },
                publishedAt: "2026-10-04T08:00:00.000Z",
              },
            },
          },
        },
        {
          id: "comment_channel_owner",
          snippet: {
            videoId,
            topLevelComment: {
              id: "comment_channel_owner",
              snippet: {
                textOriginal: "Thanks for watching everyone!",
                authorDisplayName: "Master Tech Channel",
                authorChannelId: { value: "UC_ChannelOwner_123" },
                publishedAt: "2026-10-04T07:45:00.000Z",
              },
            },
          },
        },
        {
          id: "comment_too_old",
          snippet: {
            videoId,
            topLevelComment: {
              id: "comment_too_old",
              snippet: {
                textOriginal: "Can you send the link?",
                authorDisplayName: "David Old",
                authorChannelId: { value: "UC_David_Old_04" },
                publishedAt: "2026-10-04T05:00:00.000Z", // Older than lastSeenAt (06:00)
              },
            },
          },
        },
      ],
    });

    ytClient.insertReply.mockResolvedValue({
      id: "reply_comment_youtube_999",
    });

    // Execute polling cycle
    const pollResult = await poller.pollOnce();
    expect(pollResult.status).toBe("ok");
    expect(pollResult.summary.rules).toBe(1);
    expect(pollResult.summary.comments).toBe(2); // Only comment_match_new and comment_no_match (owner ignored, old stopped cursor)
    expect(pollResult.summary.replies).toBe(1);
    expect(pollResult.summary.errors).toBe(0);

    // Verify insertReply was called exactly once with correctly rendered template
    expect(ytClient.insertReply).toHaveBeenCalledTimes(1);
    expect(ytClient.insertReply).toHaveBeenCalledWith(
      "ya29.mock_valid_access_token",
      "comment_match_new",
      "Hey Alice Smith, here is your link: https://example.com/ai-agent-tutorial"
    );

    // Verify Reply Log
    const logs = await YtReplyLog.find({});
    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.commentId).toBe("comment_match_new");
    expect(log.videoId).toBe(videoId);
    expect(log.ruleId.toString()).toBe(rule._id.toString());
    expect(log.authorName).toBe("Alice Smith");
    expect(log.matchedKeyword).toBe("code");
    expect(log.status).toBe("posted");
    expect(log.replyCommentId).toBe("reply_comment_youtube_999");
    expect(log.quotaCost).toBe(50);

    // Verify Video Rule Stats & Cursor
    const updatedRule = await YtVideoRule.findById(rule._id);
    expect(updatedRule.stats.matched).toBe(1);
    expect(updatedRule.stats.replied).toBe(1);
    expect(updatedRule.cursor.lastSeenAt.toISOString()).toBe("2026-10-04T08:30:00.000Z");
    expect(updatedRule.cursor.lastPolledAt).toBeDefined();
    expect(updatedRule.cursor.nextPollAt).toBeDefined();

    // Verify YtState and Quota
    const state = await YtState.findOne({ key: "youtube" });
    expect(state.lockUntil).toBeNull();
    expect(state.lastPollStatus).toBe("ok");
    expect(state.lastPollSummary.replies).toBe(1);
    // 1 unit for listCommentThreads + 50 units for insertReply = 51 units
    expect(state.quotaUsed).toBe(51);

    // Second poll cycle: cursor should prevent duplicate reply
    ytClient.insertReply.mockClear();
    const secondPollResult = await poller.pollOnce({ force: true });
    expect(secondPollResult.status).toBe("ok");
    expect(ytClient.insertReply).not.toHaveBeenCalled();
  });
});
