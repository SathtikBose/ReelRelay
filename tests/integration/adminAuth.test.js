const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const request = require("supertest");
const { createApp } = require("../../src/app");
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

describe("Admin Authentication Integration", () => {
  let app;
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe("GET /admin/login", () => {
    it("renders login page with 200 and CSRF token", async () => {
      const res = await request(app).get("/admin/login");
      expect(res.status).toBe(200);
      expect(res.text).toContain("ReelRelay");
      expect(res.text).toContain("Admin Password");
      expect(res.text).toContain('name="_csrf"');
    });

    it("redirects to /admin/reels if already logged in", async () => {
      let cookies = {};
      const loginPageRes = await request(app).get("/admin/login");
      cookies = updateCookies(loginPageRes, cookies);
      const match = loginPageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const loginRes = await request(app)
        .post("/admin/login")
        .set("Cookie", toCookieHeader(cookies))
        .type("form")
        .send({
          password: env.ADMIN_PASSWORD,
          _csrf: csrfToken,
        });

      cookies = updateCookies(loginRes, cookies);

      const redirectRes = await request(app)
        .get("/admin/login")
        .set("Cookie", toCookieHeader(cookies));

      expect(redirectRes.status).toBe(302);
      expect(redirectRes.headers.location).toBe("/admin/reels");
    });
  });

  describe("POST /admin/login", () => {
    it("logs in successfully with valid password and redirects to /admin/reels", async () => {
      let cookies = {};
      const loginPageRes = await request(app).get("/admin/login");
      cookies = updateCookies(loginPageRes, cookies);
      const match = loginPageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post("/admin/login")
        .set("Cookie", toCookieHeader(cookies))
        .type("form")
        .send({
          password: env.ADMIN_PASSWORD,
          _csrf: csrfToken,
        });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/reels");
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("rejects invalid password with 401 and generic error message", async () => {
      let cookies = {};
      const loginPageRes = await request(app).get("/admin/login");
      cookies = updateCookies(loginPageRes, cookies);
      const match = loginPageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const res = await request(app)
        .post("/admin/login")
        .set("Cookie", toCookieHeader(cookies))
        .type("form")
        .send({
          password: "wrong-password-12345",
          _csrf: csrfToken,
        });

      expect(res.status).toBe(401);
      expect(res.text).toContain("Incorrect password");
    });
  });

  describe("Protected Route Middleware", () => {
    it("redirects unauthenticated browser requests to /admin/login", async () => {
      const res = await request(app).get("/admin/reels");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/admin/login");
    });

    it("returns 401 JSON for unauthenticated API requests", async () => {
      const res = await request(app)
        .get("/admin/api/media")
        .set("Accept", "application/json");

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("POST /admin/logout", () => {
    it("destroys session and redirects to /admin/login", async () => {
      let cookies = {};
      const loginPageRes = await request(app).get("/admin/login");
      cookies = updateCookies(loginPageRes, cookies);
      const match = loginPageRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfToken = match ? match[1] : "";

      const loginRes = await request(app)
        .post("/admin/login")
        .set("Cookie", toCookieHeader(cookies))
        .type("form")
        .send({
          password: env.ADMIN_PASSWORD,
          _csrf: csrfToken,
        });

      cookies = updateCookies(loginRes, cookies);

      const reelsRes = await request(app)
        .get("/admin/reels")
        .set("Cookie", toCookieHeader(cookies));

      cookies = updateCookies(reelsRes, cookies);
      const authMatch = reelsRes.text.match(/name="_csrf"\s+value="([^"]+)"/);
      const authCsrfToken = authMatch ? authMatch[1] : csrfToken;

      const logoutRes = await request(app)
        .post("/admin/logout")
        .set("Cookie", toCookieHeader(cookies))
        .type("form")
        .send({ _csrf: authCsrfToken });

      expect(logoutRes.status).toBe(302);
      expect(logoutRes.headers.location).toBe("/admin/login");

      cookies = updateCookies(logoutRes, cookies);
      delete cookies.reelrelay_session;
      delete cookies["reelrelay_session.sig"];

      const accessRes = await request(app)
        .get("/admin/reels")
        .set("Cookie", toCookieHeader(cookies));

      expect(accessRes.status).toBe(302);
      expect(accessRes.headers.location).toBe("/admin/login");
    });
  });
});
