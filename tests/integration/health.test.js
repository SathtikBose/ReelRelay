const request = require("supertest");
const { createApp } = require("../../src/app");
const packageJson = require("../../package.json");

describe("Health check & routing integration", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  it("GET /health returns 200 with server status", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({
      status: "ok",
      uptime: expect.any(Number),
      db: "unknown",
      version: packageJson.version,
    });
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("returns 404 with standard error JSON for unknown routes", async () => {
    const res = await request(app).get("/unknown-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route GET /unknown-route not found",
      },
    });
  });
});
