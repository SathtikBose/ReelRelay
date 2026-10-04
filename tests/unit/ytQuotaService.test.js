const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const quotaService = require("../../src/services/youtube/quotaService");
const { YtState } = require("../../src/models/YtState");
const { env } = require("../../src/config/env");

describe("YouTube Quota Service (Phase Y3)", () => {
  let mongoServer;
  const originalBudget = env.YT_QUOTA_DAILY_BUDGET;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await YtState.deleteMany({});
    env.YT_QUOTA_DAILY_BUDGET = 9000;
    jest.useRealTimers();
  });

  afterEach(() => {
    env.YT_QUOTA_DAILY_BUDGET = originalBudget;
    jest.useRealTimers();
  });

  describe("Pacific Timezone & Midnight Calculations", () => {
    it("correctly determines Pacific day key across UTC midnight boundaries (Daylight Saving Time - PDT)", () => {
      // 2026-07-15 06:59:59 UTC is 23:59:59 PDT on 2026-07-14
      const lateNightUTC = new Date("2026-07-15T06:59:59.000Z");
      expect(quotaService.getPacificDayKey(lateNightUTC)).toBe("2026-07-14");

      // 2026-07-15 07:00:00 UTC is 00:00:00 PDT on 2026-07-15
      const midnightUTC = new Date("2026-07-15T07:00:00.000Z");
      expect(quotaService.getPacificDayKey(midnightUTC)).toBe("2026-07-15");
    });

    it("correctly determines Pacific day key during Standard Time (PST - UTC-8)", () => {
      // 2026-01-15 07:59:59 UTC is 23:59:59 PST on 2026-01-14
      const lateNightWinter = new Date("2026-01-15T07:59:59.000Z");
      expect(quotaService.getPacificDayKey(lateNightWinter)).toBe("2026-01-14");

      // 2026-01-15 08:00:00 UTC is 00:00:00 PST on 2026-01-15
      const midnightWinter = new Date("2026-01-15T08:00:00.000Z");
      expect(quotaService.getPacificDayKey(midnightWinter)).toBe("2026-01-15");
    });

    it("calculates next Pacific midnight timestamp accurately", () => {
      const current = new Date("2026-10-04T12:00:00.000Z");
      const nextMidnight = quotaService.getNextPacificMidnight(current);

      expect(nextMidnight.getTime()).toBeGreaterThan(current.getTime());
      // Next midnight in Pacific Time (PDT) on Oct 5 is 2026-10-05T07:00:00.000Z
      expect(quotaService.getPacificDayKey(nextMidnight)).toBe("2026-10-05");
    });
  });

  describe("Quota State & Automatic Rollover", () => {
    it("initializes default state on first query", async () => {
      const status = await quotaService.getQuotaStatus();

      expect(status.quotaUsed).toBe(0);
      expect(status.quotaBudget).toBe(9000);
      expect(status.quotaRemaining).toBe(9000);
      expect(status.isExceeded).toBe(false);
      expect(status.quotaExceededUntil).toBeNull();
      expect(status.quotaDayKey).toBe(quotaService.getPacificDayKey());
    });

    it("increments quota usage and calculates remaining balance", async () => {
      await quotaService.addQuotaUsage(50); // comments.insert cost
      await quotaService.addQuotaUsage(1); // commentThreads.list cost

      const status = await quotaService.getQuotaStatus();
      expect(status.quotaUsed).toBe(51);
      expect(status.quotaRemaining).toBe(8949);
      expect(status.isExceeded).toBe(false);
    });

    it("automatically resets quotaUsed to 0 when date rolls over to a new Pacific day", async () => {
      // Simulate yesterday's state
      await YtState.create({
        key: "youtube",
        quotaDayKey: "2026-10-01",
        quotaUsed: 8500,
      });

      const status = await quotaService.getQuotaStatus();
      expect(status.quotaDayKey).toBe(quotaService.getPacificDayKey());
      expect(status.quotaUsed).toBe(0);
      expect(status.quotaRemaining).toBe(9000);

      const dbDoc = await YtState.findOne({ key: "youtube" });
      expect(dbDoc.quotaDayKey).toBe(quotaService.getPacificDayKey());
      expect(dbDoc.quotaUsed).toBe(0);
    });
  });

  describe("checkQuotaAvailable & recordQuotaExceeded", () => {
    it("returns true when remaining quota is sufficient", async () => {
      await quotaService.addQuotaUsage(8900);
      expect(await quotaService.checkQuotaAvailable(50)).toBe(true);
      expect(await quotaService.checkQuotaAvailable(101)).toBe(false);
    });

    it("blocks operations when quota is marked exceeded", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      await quotaService.recordQuotaExceeded(future);

      const status = await quotaService.getQuotaStatus();
      expect(status.isExceeded).toBe(true);
      expect(await quotaService.checkQuotaAvailable(1)).toBe(false);
    });

    it("clears quotaExceeded status once expiration timestamp has passed", async () => {
      const past = new Date(Date.now() - 1000);
      await YtState.create({
        key: "youtube",
        quotaDayKey: quotaService.getPacificDayKey(),
        quotaUsed: 50,
        quotaExceededUntil: past,
      });

      const status = await quotaService.getQuotaStatus();
      expect(status.isExceeded).toBe(false);
      expect(status.quotaExceededUntil).toBeNull();
    });
  });
});
