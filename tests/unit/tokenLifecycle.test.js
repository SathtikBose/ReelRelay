const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { Credential } = require("../../src/models/Credential");
const tokenService = require("../../src/services/tokenService");
const instagramClient = require("../../src/services/instagramClient");
const scheduler = require("../../src/services/scheduler");

describe("Token Lifecycle & Scheduler Unit Tests", () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    scheduler.stopScheduler();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Credential.deleteMany({});
    jest.clearAllMocks();
  });

  describe("tokenService.refreshIfNeeded()", () => {
    it("refreshes token when expiresAt is null", async () => {
      await tokenService.saveToken("EAA_initial_token"); // null expiresAt

      jest.spyOn(instagramClient, "refreshToken").mockResolvedValue({
        access_token: "EAA_auto_refreshed_token",
        token_type: "bearer",
        expires_in: 5184000,
      });

      const result = await tokenService.refreshIfNeeded();
      expect(result.refreshed).toBe(true);

      const status = await tokenService.getTokenStatus();
      expect(status.daysLeft).toBeGreaterThan(50);
      expect(status.lastRefreshStatus).toBe("ok");
    });

    it("refreshes token when <= 15 days remain", async () => {
      // 10 days remaining
      await tokenService.saveToken("EAA_expiring_token", 10 * 24 * 60 * 60);

      jest.spyOn(instagramClient, "refreshToken").mockResolvedValue({
        access_token: "EAA_freshly_renewed_token",
        token_type: "bearer",
        expires_in: 5184000,
      });

      const result = await tokenService.refreshIfNeeded();
      expect(result.refreshed).toBe(true);

      const decrypted = await tokenService.getDecryptedToken();
      expect(decrypted).toBe("EAA_freshly_renewed_token");
    });

    it("skips refresh when > 15 days remain", async () => {
      // 40 days remaining
      await tokenService.saveToken("EAA_valid_token", 40 * 24 * 60 * 60);

      jest.spyOn(instagramClient, "refreshToken");

      const result = await tokenService.refreshIfNeeded();
      expect(result.refreshed).toBe(false);
      expect(instagramClient.refreshToken).not.toHaveBeenCalled();
    });

    it("records failure when API refresh throws error", async () => {
      await tokenService.saveToken("EAA_invalid_token", 5 * 24 * 60 * 60);

      jest.spyOn(instagramClient, "refreshToken").mockRejectedValue(
        new Error("OAuthException: Error validating access token")
      );

      const result = await tokenService.refreshIfNeeded();
      expect(result.refreshed).toBe(false);
      expect(result.error).toContain("OAuthException");

      const status = await tokenService.getTokenStatus();
      expect(status.lastRefreshStatus).toBe("error");
      expect(status.lastRefreshError).toContain("OAuthException");
    });
  });

  describe("scheduler.initScheduler()", () => {
    it("initializes cron job and stops cleanly", () => {
      const task = scheduler.initScheduler();
      expect(task).toBeDefined();

      scheduler.stopScheduler();
    });
  });
});
