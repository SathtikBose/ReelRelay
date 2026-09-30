const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { handleShutdown } = require("../../src/server");
const { env } = require("../../src/config/env");
const { queue } = require("../../src/lib/queue");

describe("Security & Hardening Integration", () => {
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

  describe("HTTP Security Headers (Helmet & CSP)", () => {
    it("sets secure headers on HTTP responses", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBeDefined();
      expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    });

    it("attaches X-Request-Id header on all incoming requests", async () => {
      const res = await request(app).get("/health");

      expect(res.headers["x-request-id"]).toBeDefined();
      expect(typeof res.headers["x-request-id"]).toBe("string");
      expect(res.headers["x-request-id"].length).toBeGreaterThan(0);
    });

    it("preserves incoming X-Request-Id header if provided by reverse proxy", async () => {
      const customId = "proxy-req-12345";
      const res = await request(app)
        .get("/health")
        .set("X-Request-Id", customId);

      expect(res.headers["x-request-id"]).toBe(customId);
    });
  });

  describe("NoSQL Injection Protection (express-mongo-sanitize)", () => {
    it("sanitizes request body containing $ operators to prevent injection", async () => {
      // POST with nested $gt operator
      const res = await request(app)
        .post("/admin/login")
        .send({
          password: { $gt: "" },
        });

      // Should be sanitized (not crash the server, rejected by validation / auth)
      expect([401, 403]).toContain(res.status);
    });
  });

  describe("Production Error Sanitization", () => {
    it("does not leak stack traces in production mode", async () => {
      const originalEnv = env.NODE_ENV;
      try {
        env.NODE_ENV = "production";

        // Route not found error or unhandled route
        const res = await request(app)
          .get("/api/non-existent-route")
          .set("Accept", "application/json");

        expect(res.status).toBe(404);
        expect(res.body.error).toBeDefined();
        expect(res.body.error.stack).toBeUndefined();
        expect(res.body.error.requestId).toBeDefined();
      } finally {
        env.NODE_ENV = originalEnv;
      }
    });
  });

  describe("Graceful Shutdown Handler", () => {
    it("drains task queue and executes shutdown cleanly", async () => {
      let taskExecuted = false;
      queue.add(async () => {
        taskExecuted = true;
      });

      await expect(handleShutdown("SIGTERM")).resolves.not.toThrow();
      expect(taskExecuted).toBe(true);
    });
  });
});
