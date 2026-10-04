const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const credentialService = require("../../src/services/youtube/credentialService");
const oauth = require("../../src/services/youtube/oauth");
const { YtCredential } = require("../../src/models/YtCredential");
const { env } = require("../../src/config/env");
const { UnauthorizedError, YouTubeApiError } = require("../../src/lib/errors");

jest.mock("../../src/services/youtube/oauth");

describe("YouTube Credential Service (Phase Y2)", () => {
  let mongoServer;
  const originalClientId = env.GOOGLE_CLIENT_ID;
  const originalClientSecret = env.GOOGLE_CLIENT_SECRET;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await YtCredential.deleteMany({});
    jest.clearAllMocks();
    env.GOOGLE_CLIENT_ID = "mock-id";
    env.GOOGLE_CLIENT_SECRET = "mock-secret";
    env.YT_ENABLED = true;
  });

  afterEach(() => {
    env.GOOGLE_CLIENT_ID = originalClientId;
    env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  });

  describe("saveCredential & getDecryptedRefreshToken", () => {
    it("encrypts and saves credentials, then successfully decrypts refresh token", async () => {
      const plaintextToken = "1//0gRealRefreshTokenSecretString123456";

      const cred = await credentialService.saveCredential({
        channelId: "UC_TestChannel_123",
        channelTitle: "Test Creator Channel",
        uploadsPlaylistId: "UU_TestChannel_123",
        refreshToken: plaintextToken,
        scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
      });

      expect(cred.channelId).toBe("UC_TestChannel_123");
      expect(cred.channelTitle).toBe("Test Creator Channel");
      expect(cred.status).toBe("connected");
      expect(cred.refreshCipher).toBeDefined();
      expect(cred.refreshCipher).not.toBe(plaintextToken);
      expect(cred.refreshIv).toBeDefined();
      expect(cred.refreshTag).toBeDefined();

      const decrypted = await credentialService.getDecryptedRefreshToken();
      expect(decrypted).toBe(plaintextToken);
    });

    it("returns null if no credentials exist", async () => {
      const decrypted = await credentialService.getDecryptedRefreshToken();
      expect(decrypted).toBeNull();
    });
  });

  describe("getAccessToken", () => {
    it("throws UnauthorizedError if no credentials are saved", async () => {
      await expect(credentialService.getAccessToken()).rejects.toThrow(UnauthorizedError);
    });

    it("refreshes token via oauth, updates DB, caches in memory, and returns fresh token", async () => {
      await credentialService.saveCredential({
        channelId: "UC123",
        channelTitle: "Creator",
        uploadsPlaylistId: "UU123",
        refreshToken: "refresh_token_abc",
      });

      oauth.refreshAccessToken.mockResolvedValue({
        accessToken: "access_token_xyz_1",
        expiresIn: 3600,
      });

      const token1 = await credentialService.getAccessToken();
      expect(token1).toBe("access_token_xyz_1");
      expect(oauth.refreshAccessToken).toHaveBeenCalledTimes(1);

      // Second call should use in-memory cache and not call oauth.refreshAccessToken again
      const token2 = await credentialService.getAccessToken();
      expect(token2).toBe("access_token_xyz_1");
      expect(oauth.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it("marks status as needs_reauth if refreshAccessToken returns invalid_grant", async () => {
      await credentialService.saveCredential({
        channelId: "UC123",
        channelTitle: "Creator",
        uploadsPlaylistId: "UU123",
        refreshToken: "bad_refresh_token",
      });

      const err = new YouTubeApiError("Authorization expired or revoked", 400, "invalid_grant", "auth");
      oauth.refreshAccessToken.mockRejectedValue(err);

      await expect(credentialService.getAccessToken()).rejects.toThrow(YouTubeApiError);

      const status = await credentialService.getStatus();
      expect(status.status).toBe("needs_reauth");
      expect(status.connected).toBe(false);
      expect(status.lastError).toMatch(/Authorization expired or revoked/);
    });
  });

  describe("markNeedsReauth", () => {
    it("updates credential status to needs_reauth and stores lastError", async () => {
      await credentialService.saveCredential({
        channelId: "UC123",
        channelTitle: "Creator",
        uploadsPlaylistId: "UU123",
        refreshToken: "token_123",
      });

      await credentialService.markNeedsReauth("Session expired manually");

      const cred = await credentialService.getCredential();
      expect(cred.status).toBe("needs_reauth");
      expect(cred.lastError).toBe("Session expired manually");
    });
  });

  describe("disconnect", () => {
    it("revokes tokens with Google and deletes credentials from database", async () => {
      oauth.revokeToken.mockResolvedValue();

      await credentialService.saveCredential({
        channelId: "UC123",
        channelTitle: "Creator",
        uploadsPlaylistId: "UU123",
        refreshToken: "token_to_disconnect",
      });

      await credentialService.disconnect();

      expect(oauth.revokeToken).toHaveBeenCalledWith("token_to_disconnect");

      const cred = await credentialService.getCredential();
      expect(cred).toBeNull();

      const status = await credentialService.getStatus();
      expect(status.connected).toBe(false);
      expect(status.status).toBe("disconnected");
    });
  });

  describe("getStatus", () => {
    it("returns disconnected status when no credentials are saved", async () => {
      const status = await credentialService.getStatus();
      expect(status).toEqual({
        configured: true,
        enabled: true,
        connected: false,
        status: "disconnected",
        channelId: "",
        channelTitle: "",
        uploadsPlaylistId: "",
        connectedAt: null,
        lastRefreshedAt: null,
        lastError: "",
      });
    });

    it("returns configured: false when GOOGLE_CLIENT_ID is missing", async () => {
      env.GOOGLE_CLIENT_ID = "";
      const status = await credentialService.getStatus();
      expect(status.configured).toBe(false);
    });

    it("returns full status when connected", async () => {
      const cred = await credentialService.saveCredential({
        channelId: "UC999",
        channelTitle: "Pro Channel",
        uploadsPlaylistId: "UU999",
        refreshToken: "token999",
      });

      const status = await credentialService.getStatus();
      expect(status.connected).toBe(true);
      expect(status.status).toBe("connected");
      expect(status.channelId).toBe("UC999");
      expect(status.channelTitle).toBe("Pro Channel");
      expect(status.uploadsPlaylistId).toBe("UU999");
      expect(status.connectedAt).toEqual(cred.connectedAt);
    });
  });
});
