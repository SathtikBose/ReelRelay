const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtReplyLog } = require("../../src/models/YtReplyLog");
const { YtState } = require("../../src/models/YtState");
const { YtCredential } = require("../../src/models/YtCredential");
const { ReplyLog } = require("../../src/models/ReplyLog");
const credentialService = require("../../src/services/youtube/credentialService");
const quotaService = require("../../src/services/youtube/quotaService");
const scheduler = require("../../src/services/youtube/scheduler");
const ytClient = require("../../src/services/youtube/ytClient");
const { env } = require("../../src/config/env");

jest.mock("../../src/services/youtube/credentialService");
jest.mock("../../src/services/youtube/quotaService");
jest.mock("../../src/services/youtube/scheduler");
jest.mock("../../src/services/youtube/ytClient");

function updateCookies(res, cookieMap = {}) {
  const setCookies = res.headers["set-cookie"] || [];
  const map = { ...cookieMap };
  for (const item of setCookies) {
    const [pair] = item.split(";");
    const idx = pair.indexOf("=");
    if (idx !== -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      map[key] = val;
    }
  }
  return map;
}

function toCookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

describe("YouTube Dashboard, Activity, Settings & Overview Integration (Phase Y5)", () => {
  let app;
  let mongoServer;
  let authCookies = {};

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await YtVideoRule.deleteMany({});
    await YtReplyLog.deleteMany({});
    await YtState.deleteMany({});
    await YtCredential.deleteMany({});
    await ReplyLog.deleteMany({});
    jest.clearAllMocks();

    env.YT_ENABLED = true;
    env.YT_POLL_ENABLED = true;

    credentialService.getStatus.mockResolvedValue({
      connected: true,
      status: "connected",
      channelTitle: "Master Creator",
      channelId: "UC_MasterCreator_123",
      connectedAt: new Date(),
      uploadsPlaylistId: "UU_MasterCreator_123",
      configured: true,
    });
    credentialService.getAccessToken.mockResolvedValue("ya29.mock_token");

    quotaService.getQuotaStatus.mockResolvedValue({
      quotaUsed: 250,
      quotaBudget: 9000,
      dailyLimit: 10000,
      isExceeded: false,
    });
    quotaService.checkQuotaAvailable.mockResolvedValue(true);
    quotaService.addQuotaUsage.mockResolvedValue();

    scheduler.pollNow.mockResolvedValue({
      status: "ok",
      summary: { rules: 2, comments: 5, replies: 2, errors: 0 },
    });

    await YtState.create({
      key: "youtube",
      lastPollAt: new Date(),
      lastPollStatus: "ok",
      lastPollSummary: { rules: 2, comments: 5, replies: 2, errors: 0 },
    });

    // Login for admin session
    authCookies = {};
    const loginPage = await request(app).get("/admin/login");
    authCookies = updateCookies(loginPage, authCookies);
    const match = loginPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
    const initialCsrf = match ? match[1] : "";

    const loginRes = await request(app)
      .post("/admin/login")
      .set("Cookie", toCookieHeader(authCookies))
      .type("form")
      .send({
        password: env.ADMIN_PASSWORD,
        _csrf: initialCsrf,
      });

    authCookies = updateCookies(loginRes, authCookies);
  });

  describe("GET /admin/youtube — Dashboard", () => {
    it("renders the connected YouTube dashboard with stats, quota meter, and poller status", async () => {
      await YtVideoRule.create({
        videoId: "dQw4w9WgXc1",
        title: "AI Video Tutorial",
        keywords: ["link"],
        replyVariants: ["Here is link: {{link}}"],
        link: "https://example.com/ai",
        active: true,
      });

      const res = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("YouTube Dashboard");
      expect(res.text).toContain("Master Creator");
      expect(res.text).toContain("YouTube API Quota Meter");
      expect(res.text).toContain("Background Poller Status");
      expect(res.text).toContain("⚡ Poll Now");
    });

    it("renders connect CTA when YouTube channel is not connected", async () => {
      credentialService.getStatus.mockResolvedValue({
        connected: false,
        status: "disconnected",
        configured: true,
      });

      const res = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Connect YouTube Channel");
      expect(res.text).toContain("Connect YouTube with Google");
    });
  });

  describe("POST /admin/youtube/poll-now", () => {
    it("triggers manual poll cycle and redirects with success flash", async () => {
      const pageRes = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(pageRes, authCookies);
      const match = pageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post("/admin/youtube/poll-now")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube");
      expect(scheduler.pollNow).toHaveBeenCalledTimes(1);
    });
  });

  describe("GET /admin/youtube/activity — Activity Log", () => {
    it("renders activity logs with status filter and pagination", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXc1",
        title: "Video Rule 1",
        keywords: ["demo"],
        replyVariants: ["Link: {{link}}"],
        link: "https://example.com",
        active: true,
      });

      await YtReplyLog.create([
        {
          commentId: "c_act_1",
          videoId: "dQw4w9WgXc1",
          ruleId: rule._id,
          authorName: "Alice",
          commentText: "send demo link",
          matchedKeyword: "demo",
          status: "posted",
          replyCommentId: "rep_1",
        },
        {
          commentId: "c_act_2",
          videoId: "dQw4w9WgXc1",
          ruleId: rule._id,
          authorName: "Bob",
          commentText: "demo please",
          matchedKeyword: "demo",
          status: "failed",
          errorMessage: "Quota limit",
        },
      ]);

      const res = await request(app)
        .get("/admin/youtube/activity?status=posted")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("YouTube Activity Log");
      expect(res.text).toContain("Alice");
      expect(res.text).not.toContain("Bob"); // Filtered out by status=posted
    });
  });

  describe("POST /admin/youtube/activity/:id/retry", () => {
    it("retries a failed reply younger than 7 days and updates status to posted", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXc1",
        title: "Video Rule 1",
        keywords: ["demo"],
        replyVariants: ["Link: {{link}}"],
        link: "https://example.com",
        active: true,
      });

      const failedLog = await YtReplyLog.create({
        commentId: "c_retry_recent",
        videoId: "dQw4w9WgXc1",
        ruleId: rule._id,
        authorName: "Alice",
        commentText: "send demo link",
        matchedKeyword: "demo",
        status: "failed",
        commentedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago (<7d)
      });

      ytClient.insertReply.mockResolvedValue({ id: "reply_retry_success" });

      const pageRes = await request(app)
        .get("/admin/youtube/activity")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(pageRes, authCookies);
      const match = pageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post(`/admin/youtube/activity/${failedLog._id}/retry`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/activity");

      const updatedLog = await YtReplyLog.findById(failedLog._id);
      expect(updatedLog.status).toBe("posted");
      expect(updatedLog.replyCommentId).toBe("reply_retry_success");
    });

    it("rejects retry for comments older than 7 days", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXc1",
        title: "Video Rule 1",
        keywords: ["demo"],
        replyVariants: ["Link: {{link}}"],
        link: "https://example.com",
        active: true,
      });

      const oldLog = await YtReplyLog.create({
        commentId: "c_retry_old",
        videoId: "dQw4w9WgXc1",
        ruleId: rule._id,
        authorName: "Bob",
        commentText: "demo please",
        matchedKeyword: "demo",
        status: "failed",
        commentedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (>=7d)
      });

      const pageRes = await request(app)
        .get("/admin/youtube/activity")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(pageRes, authCookies);
      const match = pageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post(`/admin/youtube/activity/${oldLog._id}/retry`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(res.status).toBe(302);
      const unchangedLog = await YtReplyLog.findById(oldLog._id);
      expect(unchangedLog.status).toBe("failed"); // Did not retry
      expect(ytClient.insertReply).not.toHaveBeenCalled();
    });
  });

  describe("GET /admin/youtube/settings & POST /purge-logs", () => {
    it("renders settings page with channel details and purge form", async () => {
      const res = await request(app)
        .get("/admin/youtube/settings")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("YouTube Settings");
      expect(res.text).toContain("Master Creator");
      expect(res.text).toContain("Adaptive Polling Schedule");
      expect(res.text).toContain("Activity Log Maintenance");
    });

    it("purges non-deferred logs according to retention while preserving deferred items", async () => {
      const tOld = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
      const tRecent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      await YtReplyLog.create([
        {
          commentId: "c_purge_old_posted",
          videoId: "dQw4w9WgXc1",
          status: "posted",
          createdAt: tOld,
        },
        {
          commentId: "c_purge_old_deferred",
          videoId: "dQw4w9WgXc1",
          status: "deferred", // Should NOT be purged
          createdAt: tOld,
        },
        {
          commentId: "c_purge_recent_posted",
          videoId: "dQw4w9WgXc1",
          status: "posted",
          createdAt: tRecent,
        },
      ]);

      const pageRes = await request(app)
        .get("/admin/youtube/settings")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(pageRes, authCookies);
      const match = pageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post("/admin/youtube/settings/purge-logs")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          retention: "30", // Purge older than 30 days
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/settings");

      const remainingLogs = await YtReplyLog.find({});
      expect(remainingLogs).toHaveLength(2);
      const ids = remainingLogs.map((l) => l.commentId);
      expect(ids).toContain("c_purge_old_deferred"); // Deferred preserved
      expect(ids).toContain("c_purge_recent_posted"); // Recent preserved
      expect(ids).not.toContain("c_purge_old_posted"); // Old posted deleted
    });
  });

  describe("GET /admin — Combined Platform Overview", () => {
    it("renders both Instagram and YouTube cards with live metrics and combined recent activity", async () => {
      await ReplyLog.create({
        mediaId: "ig_media_10",
        commentId: "ig_c_10",
        commenterUsername: "ig_fan",
        matchedKeyword: "send",
        status: "sent",
        createdAt: new Date("2026-10-04T11:00:00Z"),
      });

      await YtReplyLog.create({
        videoId: "dQw4w9WgXc1",
        commentId: "yt_c_10",
        authorName: "yt_fan",
        matchedKeyword: "link",
        status: "posted",
        createdAt: new Date("2026-10-04T11:05:00Z"),
      });

      const res = await request(app)
        .get("/admin")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Platform Overview");
      expect(res.text).toContain("Instagram");
      expect(res.text).toContain("YouTube");
      expect(res.text).toContain("Master Creator");
      expect(res.text).toContain("Recent Activity Across Platforms");
      expect(res.text).toContain("yt_fan");
      expect(res.text).toContain("ig_fan");
    });
  });
});
