const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtCredential } = require("../../src/models/YtCredential");
const credentialService = require("../../src/services/youtube/credentialService");
const pickerService = require("../../src/services/youtube/pickerService");
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

describe("YouTube Video Rules CRUD & Picker API Integration (Phase Y3)", () => {
  let app;
  let mongoServer;
  let authCookies = {};
  const originalFetch = global.fetch;

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
    await YtCredential.deleteMany({});
    pickerService.clearCache();
    global.fetch = originalFetch;

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

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("1. Route Protection & Auth Enforcement", () => {
    it("redirects unauthenticated GET requests to /admin/login", async () => {
      const res = await request(app).get("/admin/youtube/videos");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");

      const resNew = await request(app).get("/admin/youtube/videos/new");
      expect(resNew.status).toBe(302);
      expect(resNew.headers.location).toBe("/admin/login");
    });

    it("returns 401 JSON for unauthenticated GET /admin/youtube/api/videos", async () => {
      const res = await request(app).get("/admin/youtube/api/videos");
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("2. GET /admin/youtube/videos", () => {
    it("renders empty state when no rules exist", async () => {
      const res = await request(app)
        .get("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("YouTube Video Rules");
      expect(res.text).toContain("No video rules yet");
      expect(res.text).toContain("+ Add Your First Video");
    });

    it("renders list of video rules with stats and metadata", async () => {
      await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        title: "Rick Astley - Never Gonna Give You Up",
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        keywords: ["link", "song"],
        link: "https://example.com/rickroll",
        isShort: false,
        stats: { matched: 12, replied: 10, failed: 1 },
      });

      const res = await request(app)
        .get("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Rick Astley - Never Gonna Give You Up");
      expect(res.text).toContain("dQw4w9WgXcQ");
      expect(res.text).toContain("link");
      expect(res.text).toContain("song");
      expect(res.text).toContain("https://example.com/rickroll");
      expect(res.text).toContain("Matched:");
    });
  });

  describe("3. POST /admin/youtube/videos (Create Rule)", () => {
    it("rejects request without CSRF token with 403", async () => {
      const res = await request(app)
        .post("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          videoId: "dQw4w9WgXcQ",
          keywords: "link",
          link: "https://example.com",
        });

      expect(res.status).toBe(403);
    });

    it("creates a new video rule successfully and redirects to /admin/youtube/videos", async () => {
      // Get fresh CSRF token
      const formPage = await request(app)
        .get("/admin/youtube/videos/new")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(formPage, authCookies);
      const csrfMatch = formPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await request(app)
        .post("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          videoId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "Rick Astley",
          keywords: "link, music, pop",
          link: "https://example.com/target",
          matchMode: "word",
          replyVariants: "Here is your link: {{link}}\nEnjoy the music: {{link}}",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/videos");

      const saved = await YtVideoRule.findOne({ videoId: "dQw4w9WgXcQ" });
      expect(saved).toBeDefined();
      expect(saved.keywords).toEqual(["link", "music", "pop"]);
      expect(saved.link).toBe("https://example.com/target");
      expect(saved.replyVariants).toHaveLength(2);
      expect(saved.active).toBe(true);
    });

    it("rejects non-HTTPS destination links with flash error redirect", async () => {
      const formPage = await request(app)
        .get("/admin/youtube/videos/new")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(formPage, authCookies);
      const csrfMatch = formPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await request(app)
        .post("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          videoId: "dQw4w9WgXcQ",
          keywords: "link",
          link: "http://insecure-site.com",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/videos/new");

      const saved = await YtVideoRule.findOne({ videoId: "dQw4w9WgXcQ" });
      expect(saved).toBeNull();
    });

    it("rejects duplicate video ID with flash error redirect", async () => {
      await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        keywords: ["first"],
        link: "https://example.com/1",
      });

      const formPage = await request(app)
        .get("/admin/youtube/videos/new")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(formPage, authCookies);
      const csrfMatch = formPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await request(app)
        .post("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          videoId: "dQw4w9WgXcQ",
          keywords: "second",
          link: "https://example.com/2",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/videos/new");
    });
  });

  describe("4. GET & POST /admin/youtube/videos/:id (Edit & Update)", () => {
    it("renders edit form for existing rule", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        title: "Editable Video",
        keywords: ["editme"],
        link: "https://example.com/edit",
      });

      const res = await request(app)
        .get(`/admin/youtube/videos/${rule._id}/edit`)
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Edit YouTube Video Rule");
      expect(res.text).toContain("Editable Video");
      expect(res.text).toContain("editme");
    });

    it("updates rule details successfully", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        title: "Original Video Title",
        keywords: ["original"],
        link: "https://example.com/original",
      });

      const editPage = await request(app)
        .get(`/admin/youtube/videos/${rule._id}/edit`)
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(editPage, authCookies);
      const csrfMatch = editPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await request(app)
        .post(`/admin/youtube/videos/${rule._id}`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({
          title: "Updated Video Title",
          keywords: "updated, fresh",
          link: "https://example.com/updated",
          matchMode: "exact",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/videos");

      const updated = await YtVideoRule.findById(rule._id);
      expect(updated.title).toBe("Updated Video Title");
      expect(updated.keywords).toEqual(["updated", "fresh"]);
      expect(updated.link).toBe("https://example.com/updated");
      expect(updated.matchMode).toBe("exact");
    });
  });

  describe("5. POST /admin/youtube/videos/:id/toggle & delete", () => {
    it("toggles active state between true and false", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        keywords: ["toggle"],
        link: "https://example.com",
        active: true,
      });

      const page = await request(app)
        .get("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(page, authCookies);
      const csrfMatch = page.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      // Toggle to false
      const toggle1 = await request(app)
        .post(`/admin/youtube/videos/${rule._id}/toggle`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(toggle1.status).toBe(302);
      let updated = await YtVideoRule.findById(rule._id);
      expect(updated.active).toBe(false);

      // Toggle back to true
      const toggle2 = await request(app)
        .post(`/admin/youtube/videos/${rule._id}/toggle`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(toggle2.status).toBe(302);
      updated = await YtVideoRule.findById(rule._id);
      expect(updated.active).toBe(true);
    });

    it("deletes rule from database", async () => {
      const rule = await YtVideoRule.create({
        videoId: "dQw4w9WgXcQ",
        keywords: ["delete"],
        link: "https://example.com",
      });

      const page = await request(app)
        .get("/admin/youtube/videos")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(page, authCookies);
      const csrfMatch = page.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      const res = await request(app)
        .post(`/admin/youtube/videos/${rule._id}/delete`)
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/youtube/videos");

      const found = await YtVideoRule.findById(rule._id);
      expect(found).toBeNull();
    });
  });

  describe("6. GET /admin/youtube/api/videos (Picker API)", () => {
    it("returns JSON video list with hasRule status when channel is connected", async () => {
      // Connect channel
      await credentialService.saveCredential({
        channelId: "UC_Picker_Channel",
        channelTitle: "Channel Title",
        uploadsPlaylistId: "UU_Uploads_Playlist",
        refreshToken: "mock_refresh_token",
      });

      // Existing rule in DB
      await YtVideoRule.create({
        videoId: "vid00000001",
        keywords: ["link"],
        link: "https://example.com",
      });

      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "refreshed_access_token_abc",
              expires_in: 3600,
            }),
          };
        }

        if (url.includes("/playlistItems")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  snippet: {
                    title: "First Upload",
                    publishedAt: "2026-10-01T12:00:00Z",
                    thumbnails: { high: { url: "https://i.ytimg.com/vi/vid00000001/hqdefault.jpg" } },
                  },
                  contentDetails: { videoId: "vid00000001" },
                },
                {
                  snippet: {
                    title: "Second Upload",
                    publishedAt: "2026-10-02T12:00:00Z",
                    thumbnails: { high: { url: "https://i.ytimg.com/vi/vid00000002/hqdefault.jpg" } },
                  },
                  contentDetails: { videoId: "vid00000002" },
                },
              ],
              nextPageToken: "next_token_123",
              pageInfo: { totalResults: 2 },
            }),
          };
        }

        if (url.includes("/videos?")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                { id: "vid00000001", contentDetails: { duration: "PT45S" } },
                { id: "vid00000002", contentDetails: { duration: "PT10M" } },
              ],
            }),
          };
        }

        return { ok: false, status: 404, json: async () => ({}) };
      });

      const res = await request(app)
        .get("/admin/youtube/api/videos")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].videoId).toBe("vid00000001");
      expect(res.body.data[0].hasRule).toBe(true);
      expect(res.body.data[0].isShort).toBe(true);

      expect(res.body.data[1].videoId).toBe("vid00000002");
      expect(res.body.data[1].hasRule).toBe(false);
      expect(res.body.data[1].isShort).toBe(false);

      expect(res.body.paging.cursors.after).toBe("next_token_123");
    });
  });
});
