const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { YtCredential } = require("../../src/models/YtCredential");
const credentialService = require("../../src/services/youtube/credentialService");
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

describe("YouTube OAuth Connect & Management Integration (Phase Y2)", () => {
  let app;
  let mongoServer;
  let authCookies = {};
  const originalFetch = global.fetch;
  const originalClientId = env.GOOGLE_CLIENT_ID;
  const originalClientSecret = env.GOOGLE_CLIENT_SECRET;

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
    await YtCredential.deleteMany({});
    global.fetch = originalFetch;
    env.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com";
    env.GOOGLE_CLIENT_SECRET = "mock-google-client-secret";
    env.GOOGLE_REDIRECT_URI = "http://localhost:3000/admin/youtube/oauth/callback";

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
    env.GOOGLE_CLIENT_ID = originalClientId;
    env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    jest.restoreAllMocks();
  });

  describe("1. Authentication Protection", () => {
    it("redirects unauthenticated users from /admin/youtube/oauth/start to /admin/login", async () => {
      const res = await request(app).get("/admin/youtube/oauth/start");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("redirects unauthenticated users from /admin/youtube/oauth/callback to /admin/login", async () => {
      const res = await request(app).get("/admin/youtube/oauth/callback?code=123&state=abc");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("redirects unauthenticated users from /admin/youtube/disconnect to /admin/login when CSRF is provided", async () => {
      const loginPage = await request(app).get("/admin/login");
      const unauthCookies = updateCookies(loginPage);
      const match = loginPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post("/admin/youtube/disconnect")
        .set("Cookie", toCookieHeader(unauthCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("rejects unauthenticated POST to /admin/youtube/disconnect without CSRF with 403", async () => {
      const res = await request(app).post("/admin/youtube/disconnect");
      expect(res.status).toBe(403);
    });
  });

  describe("2. Full OAuth Connect Flow", () => {
    it("initiates OAuth flow with PKCE redirect and saves state into session", async () => {
      const startRes = await request(app)
        .get("/admin/youtube/oauth/start")
        .set("Cookie", toCookieHeader(authCookies));

      expect(startRes.status).toBe(302);
      const redirectUrl = new URL(startRes.headers.location);

      expect(redirectUrl.origin + redirectUrl.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(redirectUrl.searchParams.get("client_id")).toBe("mock-google-client-id.apps.googleusercontent.com");
      expect(redirectUrl.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.force-ssl");
      expect(redirectUrl.searchParams.get("prompt")).toBe("consent");
      expect(redirectUrl.searchParams.get("access_type")).toBe("offline");
      expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(redirectUrl.searchParams.get("state")).toBeDefined();

      authCookies = updateCookies(startRes, authCookies);
    });

    it("handles callback error from Google consent screen gracefully", async () => {
      // Start flow to have session
      const startRes = await request(app)
        .get("/admin/youtube/oauth/start")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(startRes, authCookies);

      const callbackRes = await request(app)
        .get("/admin/youtube/oauth/callback?error=access_denied")
        .set("Cookie", toCookieHeader(authCookies));

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe("/admin/youtube");
    });

    it("handles full successful OAuth authorization and channel storage", async () => {
      // Step 1: Start flow
      const startRes = await request(app)
        .get("/admin/youtube/oauth/start")
        .set("Cookie", toCookieHeader(authCookies));

      authCookies = updateCookies(startRes, authCookies);
      const redirectUrl = new URL(startRes.headers.location);
      const stateParam = redirectUrl.searchParams.get("state");

      // Step 2: Mock Google token endpoint & YouTube API channels endpoint
      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "mock_yt_access_token_abc",
              refresh_token: "mock_yt_refresh_token_xyz",
              expires_in: 3599,
              scope: "https://www.googleapis.com/auth/youtube.force-ssl",
              token_type: "Bearer",
            }),
          };
        }

        if (url.includes("/channels?part=snippet,contentDetails&mine=true")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: "UC_Integration_Channel_123",
                  snippet: {
                    title: "Tech with Alex",
                  },
                  contentDetails: {
                    relatedPlaylists: {
                      uploads: "UU_Integration_Channel_123",
                    },
                  },
                },
              ],
            }),
          };
        }

        return { ok: false, status: 404, json: async () => ({}) };
      });

      // Step 3: Call callback with valid code and state
      const callbackRes = await request(app)
        .get(`/admin/youtube/oauth/callback?code=valid_auth_code&state=${stateParam}`)
        .set("Cookie", toCookieHeader(authCookies));

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toBe("/admin/youtube");
      authCookies = updateCookies(callbackRes, authCookies);

      // Verify DB storage
      const cred = await YtCredential.findOne({ key: "youtube" });
      expect(cred).toBeDefined();
      expect(cred.channelId).toBe("UC_Integration_Channel_123");
      expect(cred.channelTitle).toBe("Tech with Alex");
      expect(cred.uploadsPlaylistId).toBe("UU_Integration_Channel_123");
      expect(cred.status).toBe("connected");
      expect(cred.refreshCipher).toBeDefined();

      // Step 4: Visit dashboard and verify connected UI state
      const dashboardRes = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(dashboardRes.status).toBe(200);
      expect(dashboardRes.text).toContain("Tech with Alex");
      expect(dashboardRes.text).toContain("UC_Integration_Channel_123");
      expect(dashboardRes.text).toContain("Connected");
      expect(dashboardRes.text).toContain("Disconnect Channel");
    });
  });

  describe("3. Disconnect Channel Flow", () => {
    it("disconnects connected channel and revokes token", async () => {
      // Setup connected channel in DB
      await credentialService.saveCredential({
        channelId: "UC_Connected_999",
        channelTitle: "Channel To Disconnect",
        uploadsPlaylistId: "UU_Connected_999",
        refreshToken: "refresh_token_to_revoke",
        scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
      });

      // Mock revoke endpoint
      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (url === "https://oauth2.googleapis.com/revoke") {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      // Fetch CSRF token from dashboard
      const dashPage = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));
      authCookies = updateCookies(dashPage, authCookies);

      const csrfMatch = dashPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";

      // Post disconnect
      const disconnectRes = await request(app)
        .post("/admin/youtube/disconnect")
        .set("Cookie", toCookieHeader(authCookies))
        .type("form")
        .send({ _csrf: csrfToken });

      expect(disconnectRes.status).toBe(302);
      expect(disconnectRes.headers.location).toBe("/admin/youtube");
      authCookies = updateCookies(disconnectRes, authCookies);

      // Verify DB is cleared
      const cred = await YtCredential.findOne({ key: "youtube" });
      expect(cred).toBeNull();

      // Verify dashboard now renders disconnected CTA
      const newDash = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(newDash.status).toBe(200);
      expect(newDash.text).toContain("Connect YouTube Channel");
      expect(newDash.text).toContain("Connect YouTube with Google");
      expect(newDash.text).not.toContain("Channel To Disconnect");
    });
  });

  describe("4. Needs Re-authentication State", () => {
    it("renders re-auth warning banner when status is needs_reauth", async () => {
      await credentialService.saveCredential({
        channelId: "UC_Expired",
        channelTitle: "Expired Channel",
        uploadsPlaylistId: "UU_Expired",
        refreshToken: "bad_token",
      });

      await credentialService.markNeedsReauth("Google refresh token was revoked by user.");

      const res = await request(app)
        .get("/admin/youtube")
        .set("Cookie", toCookieHeader(authCookies));

      expect(res.status).toBe(200);
      expect(res.text).toContain("Re-authentication Required");
      expect(res.text).toContain("Google refresh token was revoked by user.");
      expect(res.text).toContain("Connect YouTube with Google");
    });
  });
});
