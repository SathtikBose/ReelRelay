import { describe, it, expect, beforeEach } from "vitest";
import app from "../src/index";
import { createTestD1 } from "./createTestD1";
import {
  createSignedSession,
  verifySignedSession,
  verifyAdminPassword,
  checkLoginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
  buildSessionCookie,
} from "../src/lib/auth";

const TEST_SECRET = "super_secure_session_secret_32_characters_minimum";
const TEST_PASSWORD = "CorrectAdminPassword123!";

describe("Phase 5 Dashboard & Authentication Engine", () => {
  let db: D1Database;

  const mockEnv = {
    DB: {} as D1Database,
    ASSETS: {
      fetch: async (req: Request) => {
        return new Response("Static asset content for " + req.url, { status: 200 });
      },
    } as unknown as Fetcher,
    ADMIN_PASSWORD: TEST_PASSWORD,
    SESSION_SECRET: TEST_SECRET,
    META_ACCESS_TOKEN: "EAAG_secret_token_12345",
  };

  beforeEach(() => {
    db = createTestD1();
    mockEnv.DB = db;
    clearFailedLogins("127.0.0.1");
    clearFailedLogins("10.0.0.99");
  });

  describe("Session Security & Crypto", () => {
    it("generates a signed session cookie and verifies it", async () => {
      const session = await createSignedSession(TEST_SECRET);
      expect(session).toContain(".");

      const cookieHeader = `reelrelay_session=${session}; Path=/`;
      const isValid = await verifySignedSession(cookieHeader, TEST_SECRET);
      expect(isValid).toBe(true);
    });

    it("rejects tampered session signatures", async () => {
      const session = await createSignedSession(TEST_SECRET);
      const tampered = session.slice(0, -4) + "0000";
      const cookieHeader = `reelrelay_session=${tampered}`;

      const isValid = await verifySignedSession(cookieHeader, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("rejects expired sessions", async () => {
      // Create session timestamped 10 hours ago (max age is 8 hours)
      const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
      const dataBytes = new TextEncoder().encode(`admin_session:${tenHoursAgo}`);
      const sig = await import("../src/lib/crypto").then((m) =>
        m.computeHmacSha256Hex(TEST_SECRET, dataBytes)
      );
      const expiredSession = `${tenHoursAgo}.${sig}`;

      const isValid = await verifySignedSession(`reelrelay_session=${expiredSession}`, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("verifies admin password using constant-time equality", () => {
      expect(verifyAdminPassword("CorrectAdminPassword123!", TEST_PASSWORD)).toBe(true);
      expect(verifyAdminPassword("wrong_password", TEST_PASSWORD)).toBe(false);
      expect(verifyAdminPassword("", TEST_PASSWORD)).toBe(false);
    });

    it("enforces login rate limiting after 5 failed attempts", () => {
      const ip = "10.0.0.99";
      for (let i = 0; i < 5; i++) {
        expect(checkLoginRateLimit(ip).allowed).toBe(true);
        recordFailedLogin(ip);
      }

      // 6th attempt should be blocked
      const rateLimit = checkLoginRateLimit(ip);
      expect(rateLimit.allowed).toBe(false);
      expect(rateLimit.remainingAttempts).toBe(0);
      expect(rateLimit.retryAfterSec).toBeGreaterThan(0);

      // Clearing resets limit
      clearFailedLogins(ip);
      expect(checkLoginRateLimit(ip).allowed).toBe(true);
    });
  });

  describe("API Authentication Routes", () => {
    it("POST /api/auth/login rejects incorrect password with 401", async () => {
      const res = await app.request(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "wrong_password" }),
        },
        mockEnv
      );

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Incorrect password");
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("POST /api/auth/login sets HttpOnly signed session cookie on success", async () => {
      const res = await app.request(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: TEST_PASSWORD }),
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const cookie = res.headers.get("set-cookie");
      expect(cookie).toBeDefined();
      expect(cookie).toContain("reelrelay_session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
    });

    it("POST /api/auth/logout clears the session cookie", async () => {
      const res = await app.request(
        "/api/auth/logout",
        { method: "POST" },
        mockEnv
      );

      expect(res.status).toBe(200);
      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("Max-Age=0");
    });

    it("GET /api/auth/me checks session authentication", async () => {
      // 1. Unauthenticated request
      const unauthRes = await app.request("/api/auth/me", {}, mockEnv);
      expect(unauthRes.status).toBe(401);

      // 2. Authenticated request
      const session = await createSignedSession(TEST_SECRET);
      const authRes = await app.request(
        "/api/auth/me",
        {
          headers: { Cookie: buildSessionCookie(session) },
        },
        mockEnv
      );
      expect(authRes.status).toBe(200);
      const body = (await authRes.json()) as { authenticated: boolean };
      expect(body.authenticated).toBe(true);
    });
  });

  describe("Protected Keywords CRUD API", () => {
    let authHeader: Record<string, string>;

    beforeEach(async () => {
      const session = await createSignedSession(TEST_SECRET);
      authHeader = {
        Cookie: buildSessionCookie(session),
        "Content-Type": "application/json",
      };
    });

    it("rejects unauthenticated requests to /api/keywords with 401", async () => {
      const res = await app.request("/api/keywords", {}, mockEnv);
      expect(res.status).toBe(401);
    });

    it("creates, reads, updates, toggles, and deletes rules via API", async () => {
      // 1. Create Rule
      const createRes = await app.request(
        "/api/keywords",
        {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            mediaId: "1790011223344",
            keyword: "book, guide",
            link: "https://example.com/download",
            dmMessage: "Hey {{username}}, here is your link: {{link}}",
            matchMode: "word",
          }),
        },
        mockEnv
      );

      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { data: any };
      const ruleId = created.data.id;
      expect(ruleId).toBeDefined();
      expect(created.data.media_id).toBe("1790011223344");

      // 2. List Rules
      const listRes = await app.request("/api/keywords", { headers: authHeader }, mockEnv);
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as { data: any[] };
      expect(listData.data).toHaveLength(1);
      expect(listData.data[0].id).toBe(ruleId);

      // Verify token is NEVER leaked to browser
      expect(JSON.stringify(listData)).not.toContain("EAAG_secret_token_12345");

      // 3. Update Rule
      const updateRes = await app.request(
        `/api/keywords/${ruleId}`,
        {
          method: "PUT",
          headers: authHeader,
          body: JSON.stringify({
            link: "https://example.com/updated-link",
            keyword: "course",
          }),
        },
        mockEnv
      );
      expect(updateRes.status).toBe(200);
      const updatedData = (await updateRes.json()) as { data: any };
      expect(updatedData.data.link).toBe("https://example.com/updated-link");
      expect(updatedData.data.keyword).toBe("course");

      // 4. Toggle Rule
      const toggleRes = await app.request(
        `/api/keywords/${ruleId}/toggle`,
        {
          method: "POST",
          headers: authHeader,
        },
        mockEnv
      );
      expect(toggleRes.status).toBe(200);
      const toggleData = (await toggleRes.json()) as { active: boolean };
      expect(toggleData.active).toBe(false);

      // 5. Get Stats
      const statsRes = await app.request("/api/stats", { headers: authHeader }, mockEnv);
      expect(statsRes.status).toBe(200);
      const statsData = (await statsRes.json()) as { stats: any };
      expect(statsData.stats.totalRules).toBe(1);
      expect(statsData.stats.activeRules).toBe(0); // Paused

      // 6. Delete Rule
      const deleteRes = await app.request(
        `/api/keywords/${ruleId}`,
        {
          method: "DELETE",
          headers: authHeader,
        },
        mockEnv
      );
      expect(deleteRes.status).toBe(200);

      // Verify rule list is now empty
      const afterDeleteRes = await app.request("/api/keywords", { headers: authHeader }, mockEnv);
      const afterDeleteData = (await afterDeleteRes.json()) as { data: any[] };
      expect(afterDeleteData.data).toHaveLength(0);
    });

    it("rejects non-HTTPS links with 400", async () => {
      const res = await app.request(
        "/api/keywords",
        {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({
            mediaId: "123",
            keyword: "link",
            link: "http://insecure.com",
          }),
        },
        mockEnv
      );

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain("HTTPS");
    });
  });

  describe("Dashboard Page Routing", () => {
    it("redirects unauthenticated user from / to /login", async () => {
      const res = await app.request("/", {}, mockEnv);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login");
    });

    it("redirects from /admin to /", async () => {
      const res = await app.request("/admin", {}, mockEnv);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/");
    });

    it("serves dashboard asset when session is valid", async () => {
      const session = await createSignedSession(TEST_SECRET);
      const res = await app.request(
        "/",
        {
          headers: { Cookie: buildSessionCookie(session) },
        },
        mockEnv
      );

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Static asset content");
    });
  });
});
