const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { Reel } = require("../../src/models/Reel");
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

describe("Admin Reels & Rules Integration", () => {
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

    const reelsPage = await request(app)
      .get("/admin/reels")
      .set("Cookie", toCookieHeader(authCookies));

    authCookies = updateCookies(reelsPage, authCookies);
    const reelsMatch = reelsPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
    currentCsrfToken = reelsMatch ? reelsMatch[1] : initialCsrf;
  });

  describe("GET /admin/reels", () => {
    it("renders empty state when no rules exist", async () => {
      const res = await request(app)
        .get("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("No reel rules yet");
      expect(res.text).toContain("Add Your First Reel");
    });

    it("renders list of reel rules with stats and metadata", async () => {
      await Reel.create({
        mediaId: "17999888777",
        caption: "Check out this amazing tutorial!",
        keywords: ["tutorial", "guide"],
        matchMode: "word",
        link: "https://example.com/guide",
        active: true,
        stats: { matched: 10, sent: 8, failed: 2 },
      });

      const res = await request(app)
        .get("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("17999888777");
      expect(res.text).toContain("Check out this amazing tutorial!");
      expect(res.text).toContain("tutorial");
      expect(res.text).toContain("guide");
      expect(res.text).toContain("https://example.com/guide");
      expect(res.text).toContain("Active");
      expect(res.text).toContain("Matched: <strong>10</strong>");
      expect(res.text).toContain("Sent: <strong style=\"color: var(--success);\">8</strong>");
    });
  });

  describe("POST /admin/reels (Create)", () => {
    it("rejects request without CSRF token with 403", async () => {
      const res = await request(app)
        .post("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          mediaId: "179111222333",
          keywords: "link, free",
          link: "https://example.com/free",
        });

      expect(res.status).toBe(403);
    });

    it("creates a new rule successfully and redirects to /admin/reels", async () => {
      const res = await request(app)
        .post("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          _csrf: currentCsrfToken,
          mediaId: "179111222333",
          keywords: "link, free",
          matchMode: "word",
          link: "https://example.com/free",
          dmTemplate: "Hey {{username}}! Here is your {{keyword}}: {{link}}",
          active: "true",
          caption: "Awesome reel caption",
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/reels");

      const created = await Reel.findOne({ mediaId: "179111222333" });
      expect(created).toBeDefined();
      expect(created.keywords).toEqual(["link", "free"]);
      expect(created.matchMode).toBe("word");
      expect(created.link).toBe("https://example.com/free");
      expect(created.caption).toBe("Awesome reel caption");
    });

    it("rejects non-https link with 400 validation error", async () => {
      const res = await request(app)
        .post("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          _csrf: currentCsrfToken,
          mediaId: "179111222444",
          keywords: "test",
          link: "http://insecure-link.com",
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain("Link must use HTTPS protocol");
    });

    it("rejects duplicate media ID with 400 error", async () => {
      await Reel.create({
        mediaId: "179111222555",
        keywords: ["link"],
        link: "https://example.com",
      });

      const res = await request(app)
        .post("/admin/reels")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          _csrf: currentCsrfToken,
          mediaId: "179111222555",
          keywords: "another",
          link: "https://example.com/another",
        });

      expect(res.status).toBe(400);
      expect(res.text).toContain("A rule for this Reel media ID already exists");
    });
  });

  describe("POST /admin/reels/:id (Update)", () => {
    it("updates existing rule fields and redirects", async () => {
      const rule = await Reel.create({
        mediaId: "179888777666",
        keywords: ["old"],
        matchMode: "word",
        link: "https://example.com/old",
      });

      const res = await request(app)
        .post(`/admin/reels/${rule._id}`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          _csrf: currentCsrfToken,
          mediaId: "179888777666",
          keywords: "new, updated",
          matchMode: "exact",
          link: "https://example.com/new",
          dmTemplate: "Updated {{link}}",
          active: "false",
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/reels");

      const updated = await Reel.findById(rule._id);
      expect(updated.keywords).toEqual(["new", "updated"]);
      expect(updated.matchMode).toBe("exact");
      expect(updated.link).toBe("https://example.com/new");
      expect(updated.active).toBe(false);
    });
  });

  describe("POST /admin/reels/:id/toggle", () => {
    it("toggles active status from true to false and back", async () => {
      const rule = await Reel.create({
        mediaId: "179333444555",
        keywords: ["toggle"],
        link: "https://example.com/toggle",
        active: true,
      });

      const toggleRes1 = await request(app)
        .post(`/admin/reels/${rule._id}/toggle`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: currentCsrfToken });

      expect(toggleRes1.status).toBe(302);
      let updated = await Reel.findById(rule._id);
      expect(updated.active).toBe(false);

      const toggleRes2 = await request(app)
        .post(`/admin/reels/${rule._id}/toggle`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: currentCsrfToken });

      expect(toggleRes2.status).toBe(302);
      updated = await Reel.findById(rule._id);
      expect(updated.active).toBe(true);
    });
  });

  describe("POST /admin/reels/:id/delete", () => {
    it("deletes the rule from database", async () => {
      const rule = await Reel.create({
        mediaId: "179555666777",
        keywords: ["delete"],
        link: "https://example.com/delete",
      });

      const res = await request(app)
        .post(`/admin/reels/${rule._id}/delete`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: currentCsrfToken });

      expect(res.status).toBe(302);
      const exists = await Reel.findById(rule._id);
      expect(exists).toBeNull();
    });
  });

  describe("GET /admin/api/media (Reel Picker)", () => {
    it("returns formatted reels list with hasRule status", async () => {
      await Reel.create({
        mediaId: "1790001",
        keywords: ["existing"],
        link: "https://example.com",
      });

      jest.spyOn(instagramClient, "listRecentMedia").mockResolvedValue({
        data: [
          {
            id: "1790001",
            caption: "Reel with existing rule",
            media_type: "VIDEO",
            media_product_type: "REELS",
            permalink: "https://instagram.com/reel/1",
            thumbnail_url: "https://example.com/thumb1.jpg",
            timestamp: "2026-09-01T12:00:00Z",
          },
          {
            id: "1790002",
            caption: "Fresh reel without rule",
            media_type: "VIDEO",
            media_product_type: "REELS",
            permalink: "https://instagram.com/reel/2",
            thumbnail_url: "https://example.com/thumb2.jpg",
            timestamp: "2026-09-02T12:00:00Z",
          },
        ],
        paging: { cursors: { after: "cursor123" } },
      });

      const res = await request(app)
        .get("/admin/api/media")
        .set("Cookie", toCookieHeader(authCookies))
        .set("Accept", "application/json");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].id).toBe("1790001");
      expect(res.body.data[0].hasRule).toBe(true);
      expect(res.body.data[1].id).toBe("1790002");
      expect(res.body.data[1].hasRule).toBe(false);
      expect(res.body.paging.cursors.after).toBe("cursor123");
    });

    it("returns 502 with error details when Instagram API fails", async () => {
      jest.spyOn(instagramClient, "listRecentMedia").mockRejectedValue(
        new Error("Instagram API connection timeout")
      );

      const res = await request(app)
        .get("/admin/api/media")
        .set("Cookie", toCookieHeader(authCookies))
        .set("Accept", "application/json");

      expect(res.status).toBe(502);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("MEDIA_FETCH_FAILED");
      expect(res.body.error.message).toContain("Instagram API connection timeout");
    });
  });
});
