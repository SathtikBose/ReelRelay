const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { Reel } = require("../../src/models/Reel");
const { ReplyLog } = require("../../src/models/ReplyLog");
const { Credential } = require("../../src/models/Credential");
const { env } = require("../../src/config/env");

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

describe("Admin Dashboard Integration", () => {
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
    await Reel.deleteMany({});
    await ReplyLog.deleteMany({});
    await Credential.deleteMany({});

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

  it("renders dashboard with aggregate statistics", async () => {
    // 1. Seed rules
    await Reel.create({
      mediaId: "179001",
      keywords: ["link"],
      link: "https://example.com/1",
      active: true,
    });
    await Reel.create({
      mediaId: "179002",
      keywords: ["guide"],
      link: "https://example.com/2",
      active: false,
    });

    // 2. Seed reply logs
    await ReplyLog.create({
      commentId: "c1",
      mediaId: "179001",
      commenterId: "u1",
      commenterUsername: "user1",
      commentText: "link please",
      matchedKeyword: "link",
      status: "sent",
      sentAt: new Date(),
    });
    await ReplyLog.create({
      commentId: "c2",
      mediaId: "179001",
      commenterId: "u2",
      commenterUsername: "user2",
      commentText: "link",
      matchedKeyword: "link",
      status: "failed",
      errorMessage: "Instagram timeout",
    });

    // 3. Seed credential with 30 days remaining
    await Credential.create({
      key: "instagram",
      tokenCipher: "cipher",
      tokenIv: "iv",
      tokenTag: "tag",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get("/admin")
      .set("Cookie", toCookieHeader(authCookies));

    expect(res.status).toBe(200);
    expect(res.text).toContain("Dashboard");
    expect(res.text).toContain("Sent (Today)");
    expect(res.text).toContain("Active Rules");
    expect(res.text).toContain("@user1");
    expect(res.text).toContain("@user2");
  });

  it("displays warning banner when token expires in less than 10 days", async () => {
    await Credential.create({
      key: "instagram",
      tokenCipher: "cipher",
      tokenIv: "iv",
      tokenTag: "tag",
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days left
    });

    const res = await request(app)
      .get("/admin")
      .set("Cookie", toCookieHeader(authCookies));

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/expires in [45] days/);
  });
});
