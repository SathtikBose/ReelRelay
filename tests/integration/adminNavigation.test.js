const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { Reel } = require("../../src/models/Reel");
const { ReplyLog } = require("../../src/models/ReplyLog");
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

describe("Admin Navigation, Platform Tabs & Namespacing Integration (Phase Y1)", () => {
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

  describe("1. Legacy URL 302 Redirects with Query Preservation", () => {
    it("redirects /admin/reels to /admin/instagram/reels", async () => {
      const res = await request(app)
        .get("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/instagram/reels");
    });

    it("redirects /admin/reels/new to /admin/instagram/reels/new", async () => {
      const res = await request(app)
        .get("/admin/reels/new")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/instagram/reels/new");
    });

    it("redirects /admin/reels/:id/edit to /admin/instagram/reels/:id/edit", async () => {
      const res = await request(app)
        .get("/admin/reels/66fd1234567890abcdef1234/edit")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/instagram/reels/66fd1234567890abcdef1234/edit");
    });

    it("redirects /admin/activity with query params preserving query string", async () => {
      const res = await request(app)
        .get("/admin/activity?status=failed&page=2&mediaId=17999")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/instagram/activity?status=failed&page=2&mediaId=17999");
    });

    it("redirects /admin/settings to /admin/instagram/settings", async () => {
      const res = await request(app)
        .get("/admin/settings")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/instagram/settings");
    });

    it("redirects /admin/api/media with query params preserving query string", async () => {
      const res = await request(app)
        .get("/admin/api/media?limit=10&after=cursor123")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/instagram/api/media?limit=10&after=cursor123");
    });
  });

  describe("2. Overview Page (/admin)", () => {
    it("renders the Overview page with platform cards when authenticated", async () => {
      const res = await request(app)
        .get("/admin")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Platform Overview");
      expect(res.text).toContain("Instagram");
      expect(res.text).toContain("YouTube");
      expect(res.text).toContain('aria-current="page"');
    });

    it("redirects to /admin/login when unauthenticated", async () => {
      const res = await request(app).get("/admin");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });
  });

  describe("3. YouTube Platform Section (/admin/youtube)", () => {
    it("renders the YouTube platform shell when authenticated", async () => {
      const res = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Connect YouTube Channel");
      expect(res.text).toContain("Connect YouTube with Google");
      expect(res.text).toContain('aria-current="page"');
    });

    it("redirects to /admin/login when unauthenticated", async () => {
      const res = await request(app).get("/admin/youtube");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });
  });

  describe("4. Authentication Protection on Namespaced Routes", () => {
    it("enforces authentication on /admin/instagram/dashboard", async () => {
      const res = await request(app).get("/admin/instagram/dashboard");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("enforces authentication on /admin/instagram/reels", async () => {
      const res = await request(app).get("/admin/instagram/reels");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("enforces authentication on /admin/instagram/activity", async () => {
      const res = await request(app).get("/admin/instagram/activity");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("enforces authentication on /admin/instagram/settings", async () => {
      const res = await request(app).get("/admin/instagram/settings");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });
  });

  describe("5. Active Tab & Subnav Highlighting", () => {
    it("marks Overview tab as active on /admin", async () => {
      const res = await request(app)
        .get("/admin")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/class="platform-tab tab-overview active"/);
    });

    it("marks Instagram tab and Reels subnav as active on /admin/instagram/reels", async () => {
      const res = await request(app)
        .get("/admin/instagram/reels")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/class="platform-tab tab-instagram active"/);
      expect(res.text).toContain('href="/admin/instagram/reels" class="nav-item-link active"');
    });

    it("marks YouTube tab as active on /admin/youtube", async () => {
      const res = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toMatch(/class="platform-tab tab-youtube active"/);
    });
  });
});
