const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { Reel } = require("../../src/models/reel");
const { ReplyLog } = require("../../src/models/replyLog");
const { env } = require("../../src/config/env");
const instagramClient = require("../../src/services/instagramClient");

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

describe("Admin Activity & Retry Integration", () => {
  let app;
  let mongoServer;
  let authCookies = {};
  let currentCsrfToken = "";

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
    await Reel.deleteMany({});
    await ReplyLog.deleteMany({});
    jest.clearAllMocks();

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

    const formPage = await request(app)
      .get("/admin/reels/new")
      .set("Cookie", toCookieHeader(authCookies));

    authCookies = updateCookies(formPage, authCookies);
    const formMatch = formPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
    currentCsrfToken = formMatch ? formMatch[1] : initialCsrf;
  });

  it("filters activity logs by status and reel mediaId", async () => {
    await ReplyLog.create({
      commentId: "c_sent",
      mediaId: "179111",
      commenterId: "u1",
      commenterUsername: "user_sent",
      commentText: "send link",
      status: "sent",
    });

    await ReplyLog.create({
      commentId: "c_failed",
      mediaId: "179222",
      commenterId: "u2",
      commenterUsername: "user_failed",
      commentText: "send info",
      status: "failed",
    });

    // Filter status=sent
    const resSent = await request(app)
      .get("/admin/activity?status=sent")
      .set("Cookie", toCookieHeader(authCookies));

    expect(resSent.status).toBe(200);
    expect(resSent.text).toContain("user_sent");
    expect(resSent.text).not.toContain("user_failed");

    // Filter mediaId=179222
    const resMedia = await request(app)
      .get("/admin/activity?mediaId=179222")
      .set("Cookie", toCookieHeader(authCookies));

    expect(resMedia.status).toBe(200);
    expect(resMedia.text).toContain("user_failed");
    expect(resMedia.text).not.toContain("user_sent");
  });

  it("allows retrying a failed DM younger than 7 days and updates status to sent", async () => {
    await Reel.create({
      mediaId: "179333",
      keywords: ["retry"],
      link: "https://example.com/retry-target",
      dmTemplate: "Hello {{username}}! Here is your {{keyword}}: {{link}}",
      active: true,
      stats: { matched: 1, sent: 0, failed: 1 },
    });

    const failedLog = await ReplyLog.create({
      commentId: "c_retry_recent",
      mediaId: "179333",
      commenterId: "u3",
      commenterUsername: "alex",
      commentText: "retry me",
      matchedKeyword: "retry",
      status: "failed",
      errorMessage: "Transient timeout",
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
    });

    jest.spyOn(instagramClient, "sendPrivateReply").mockResolvedValue({
      recipient_id: "u3",
      message_id: "m_retry_123",
    });

    const res = await request(app)
      .post(`/admin/activity/${failedLog._id}/retry`)
      .set("Cookie", toCookieHeader(authCookies))
      .type("form")
      .send({ _csrf: currentCsrfToken });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/activity");

    const updatedLog = await ReplyLog.findById(failedLog._id);
    expect(updatedLog.status).toBe("sent");
    expect(updatedLog.messageId).toBe("m_retry_123");
    expect(updatedLog.attempts).toBe(2);

    expect(instagramClient.sendPrivateReply).toHaveBeenCalledWith(
      "c_retry_recent",
      "Hello alex! Here is your retry: https://example.com/retry-target"
    );
  });

  it("blocks retrying a failed DM older than 7 days per policy", async () => {
    await Reel.create({
      mediaId: "179444",
      keywords: ["old"],
      link: "https://example.com/old",
      active: true,
    });

    const oldFailedLog = await ReplyLog.create({
      commentId: "c_retry_old",
      mediaId: "179444",
      commenterId: "u4",
      commenterUsername: "sam",
      commentText: "old comment",
      matchedKeyword: "old",
      status: "failed",
      errorMessage: "Network error",
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days old
    });

    jest.spyOn(instagramClient, "sendPrivateReply");

    const res = await request(app)
      .post(`/admin/activity/${oldFailedLog._id}/retry`)
      .set("Cookie", toCookieHeader(authCookies))
      .type("form")
      .send({ _csrf: currentCsrfToken });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/activity");

    expect(instagramClient.sendPrivateReply).not.toHaveBeenCalled();

    const notUpdated = await ReplyLog.findById(oldFailedLog._id);
    expect(notUpdated.status).toBe("failed");
  });
});
