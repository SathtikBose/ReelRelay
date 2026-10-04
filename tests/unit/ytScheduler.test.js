const scheduler = require("../../src/services/youtube/scheduler");
const poller = require("../../src/services/youtube/poller");
const { env } = require("../../src/config/env");

jest.mock("../../src/services/youtube/poller");

describe("YouTube Poller Scheduler (Phase Y4)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler.stopScheduler();
    env.YT_ENABLED = true;
    env.YT_POLL_ENABLED = true;
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    scheduler.stopScheduler();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("skips scheduler initialization when YT_ENABLED or YT_POLL_ENABLED is false", () => {
    env.YT_POLL_ENABLED = false;
    process.env.NODE_ENV = "production";

    scheduler.initScheduler();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("skips scheduler initialization in test environment", () => {
    process.env.NODE_ENV = "test";

    scheduler.initScheduler();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("initializes scheduler and sets interval in non-test environment", () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = "production";
    poller.pollOnce.mockResolvedValue({ status: "ok" });

    scheduler.initScheduler();
    expect(scheduler.isRunning()).toBe(true);

    // Stop scheduler
    scheduler.stopScheduler();
    expect(scheduler.isRunning()).toBe(false);
    jest.useRealTimers();
  });

  it("pollNow calls poller.pollOnce with force: true", async () => {
    poller.pollOnce.mockResolvedValue({ status: "ok", summary: { rules: 1, comments: 2, replies: 1, errors: 0 } });

    const res = await scheduler.pollNow();
    expect(poller.pollOnce).toHaveBeenCalledWith({ force: true });
    expect(res.status).toBe("ok");
  });
});
