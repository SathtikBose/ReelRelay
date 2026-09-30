const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { Credential } = require("../../src/models/Credential");
const { env } = require("../../src/config/env");
const tokenService = require("../../src/services/tokenService");
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

describe("Admin Settings Integration", () => {
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
    await Credential.deleteMany({});
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

    const settingsPage = await request(app)
      .get("/admin/settings")
      .set("Cookie", toCookieHeader(authCookies));

    authCookies = updateCookies(settingsPage, authCookies);
    const setMatch = settingsPage.text.match(/name="_csrf"\s+value="([^"]+)"/);
    currentCsrfToken = setMatch ? setMatch[1] : initialCsrf;
  });

  it("renders settings page with token status, webhook info, and app health", async () => {
    await tokenService.saveToken("EAA_test_token", 45 * 24 * 60 * 60);

    const res = await request(app)
      .get("/admin/settings")
      .set("Cookie", toCookieHeader(authCookies));

    expect(res.status).toBe(200);
    expect(res.text).toContain("Instagram Access Token");
    expect(res.text).toMatch(/4[45] days/);
    expect(res.text).toContain("/webhook");
    expect(res.text).toContain("connected");
  });

  it("manually refreshes token via POST /admin/settings/refresh-token", async () => {
    await tokenService.saveToken("EAA_old_token", 10 * 24 * 60 * 60);

    jest.spyOn(instagramClient, "refreshToken").mockResolvedValue({
      access_token: "EAA_refreshed_new_token",
      token_type: "bearer",
      expires_in: 5184000, // 60 days
    });

    const res = await request(app)
      .post("/admin/settings/refresh-token")
      .set("Cookie", toCookieHeader(authCookies))
      .type("form")
      .send({ _csrf: currentCsrfToken });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/settings");

    const decrypted = await tokenService.getDecryptedToken();
    expect(decrypted).toBe("EAA_refreshed_new_token");
  });

  it("replaces token via POST /admin/settings/replace-token", async () => {
    const res = await request(app)
      .post("/admin/settings/replace-token")
      .set("Cookie", toCookieHeader(authCookies))
      .type("form")
      .send({
        _csrf: currentCsrfToken,
        token: "EAA_brand_new_custom_token",
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/settings");

    const decrypted = await tokenService.getDecryptedToken();
    expect(decrypted).toBe("EAA_brand_new_custom_token");
  });
});
