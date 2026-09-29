const { startDb, stopDb, clearDb } = require("../setupDb");
const { Credential } = require("../../src/models/Credential");
const tokenService = require("../../src/services/tokenService");
const { env } = require("../../src/config/env");

beforeAll(async () => {
  await startDb();
  await Credential.init();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  await clearDb();
});

describe("Token Service", () => {
  describe("bootstrapToken()", () => {
    it("bootstraps encrypted token when no credential exists and env has token", async () => {
      const originalToken = env.IG_ACCESS_TOKEN;
      env.IG_ACCESS_TOKEN = "EAAB_test_bootstrap_token_12345";

      try {
        const result = await tokenService.bootstrapToken();
        expect(result).toBe(true);

        const cred = await Credential.findOne({ key: "instagram" });
        expect(cred).toBeDefined();
        expect(cred.tokenCipher).toBeDefined();
        expect(cred.tokenCipher).not.toBe("EAAB_test_bootstrap_token_12345"); // Must be encrypted

        const decrypted = await tokenService.getDecryptedToken();
        expect(decrypted).toBe("EAAB_test_bootstrap_token_12345");
      } finally {
        env.IG_ACCESS_TOKEN = originalToken;
      }
    });

    it("does nothing if credential already exists", async () => {
      await tokenService.saveToken("existing_token_value");
      const result = await tokenService.bootstrapToken();
      expect(result).toBe(false);

      const decrypted = await tokenService.getDecryptedToken();
      expect(decrypted).toBe("existing_token_value");
    });
  });

  describe("getDecryptedToken()", () => {
    it("throws 401 when no token is present in database", async () => {
      await expect(tokenService.getDecryptedToken()).rejects.toThrow(/not configured/);
    });

    it("returns decrypted plaintext token", async () => {
      await tokenService.saveToken("my_super_secret_instagram_token");
      const token = await tokenService.getDecryptedToken();
      expect(token).toBe("my_super_secret_instagram_token");
    });
  });

  describe("saveToken()", () => {
    it("saves encrypted token with expiration date calculation", async () => {
      const expiresInSeconds = 5184000; // 60 days
      const beforeSave = Date.now();

      await tokenService.saveToken("refreshed_token_60_days", expiresInSeconds, "17841499999");

      const status = await tokenService.getTokenStatus();
      expect(status.exists).toBe(true);
      expect(status.igUserId).toBe("17841499999");
      expect(status.expiresAt).toBeInstanceOf(Date);
      expect(status.expiresAt.getTime()).toBeGreaterThanOrEqual(beforeSave + (expiresInSeconds - 5) * 1000);
      expect(status.daysLeft).toBeGreaterThanOrEqual(59);
      expect(status.isExpired).toBe(false);
      expect(status.lastRefreshStatus).toBe("ok");
    });
  });

  describe("recordRefreshFailure()", () => {
    it("records refresh error status and message", async () => {
      await tokenService.saveToken("token_to_fail_refresh");
      await tokenService.recordRefreshFailure("OAuthException: Error validating access token");

      const status = await tokenService.getTokenStatus();
      expect(status.lastRefreshStatus).toBe("error");
      expect(status.lastRefreshError).toContain("OAuthException");
    });
  });

  describe("getTokenStatus()", () => {
    it("returns empty metadata when no token configured", async () => {
      const status = await tokenService.getTokenStatus();
      expect(status.exists).toBe(false);
      expect(status.expiresAt).toBeNull();
      expect(status.daysLeft).toBeNull();
    });

    it("calculates isExpired correctly for past expiration dates", async () => {
      await tokenService.saveToken("expired_token");
      await Credential.updateOne(
        { key: "instagram" },
        { expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24) } // 1 day ago
      );

      const status = await tokenService.getTokenStatus();
      expect(status.isExpired).toBe(true);
      expect(status.daysLeft).toBeLessThan(0);
    });
  });
});
