const http = require("http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { createApp } = require("../../src/app");
const { runSmokeTests } = require("../../scripts/smoke");
const { env } = require("../../src/config/env");

describe("Smoke Test Runner Unit/Integration Tests", () => {
  let server;
  let mongoServer;
  let baseUrl;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const app = createApp();
    server = http.createServer(app);

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("successfully passes all smoke test checks against a running instance", async () => {
    const result = await runSmokeTests(baseUrl, env.IG_VERIFY_TOKEN);

    expect(result.success).toBe(true);
    expect(result.passed).toBe(6);
    expect(result.failed).toBe(0);
  });

  it("detects failures when target endpoint is unavailable or returns errors", async () => {
    // Non-existent server port
    const result = await runSmokeTests("http://127.0.0.1:59999", env.IG_VERIFY_TOKEN);

    expect(result.success).toBe(false);
    expect(result.failed).toBeGreaterThan(0);
  });
});
