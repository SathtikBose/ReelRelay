const request = require("supertest");
const { startDb, stopDb } = require("../setupDb");
const { createApp } = require("../../src/app");
const packageJson = require("../../package.json");

describe("Health check & routing integration", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await stopDb();
  });

  it("GET /health returns 200 with db='disconnected' when DB is not connected", async () => {
    await stopDb(); // Ensure disconnected
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body).toEqual({
      status: "ok",
      uptime: expect.any(Number),
      db: "disconnected",
      version: packageJson.version,
    });
    expect(res.headers["x-request-id"]).toBeDefined();
  });

  it("GET /health returns 200 with db='connected' when DB is connected", async () => {
    await startDb();

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.db).toBe("connected");
  });

  it("returns 404 with standard error JSON for unknown routes", async () => {
    const res = await request(app).get("/unknown-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route GET /unknown-route not found",
        requestId: expect.any(String),
      },
    });
  });
});
