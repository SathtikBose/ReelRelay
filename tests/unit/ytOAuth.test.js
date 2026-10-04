const oauth = require("../../src/services/youtube/oauth");
const { env } = require("../../src/config/env");
const { ValidationError, YouTubeApiError } = require("../../src/lib/errors");

describe("YouTube OAuth Service (Phase Y2)", () => {
  const originalFetch = global.fetch;
  const originalClientId = env.GOOGLE_CLIENT_ID;
  const originalClientSecret = env.GOOGLE_CLIENT_SECRET;

  beforeEach(() => {
    env.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com";
    env.GOOGLE_CLIENT_SECRET = "mock-google-client-secret";
    env.GOOGLE_REDIRECT_URI = "http://localhost:3000/admin/youtube/oauth/callback";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    env.GOOGLE_CLIENT_ID = originalClientId;
    env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    jest.restoreAllMocks();
  });

  describe("generateAuthUrl", () => {
    it("generates a valid Google OAuth URL with PKCE and state, storing verifier in session", () => {
      const session = {};
      const urlString = oauth.generateAuthUrl(session);
      const url = new URL(urlString);

      expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url.searchParams.get("client_id")).toBe("mock-google-client-id.apps.googleusercontent.com");
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/admin/youtube/oauth/callback");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.force-ssl");
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(url.searchParams.get("prompt")).toBe("consent");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toBeDefined();
      expect(url.searchParams.get("state")).toBeDefined();

      expect(session.ytOauth).toBeDefined();
      expect(session.ytOauth.state).toBe(url.searchParams.get("state"));
      expect(session.ytOauth.codeVerifier).toBeDefined();
      expect(session.ytOauth.expiresAt).toBeGreaterThan(Date.now());
    });

    it("throws ValidationError if Google OAuth credentials are not configured", () => {
      env.GOOGLE_CLIENT_ID = "";
      const session = {};

      expect(() => oauth.generateAuthUrl(session)).toThrow(ValidationError);
      expect(() => oauth.generateAuthUrl(session)).toThrow(/Google OAuth is not configured/);
    });
  });

  describe("validateAndExchangeCode", () => {
    it("throws ValidationError when Google returns an error parameter", async () => {
      const query = { error: "access_denied" };
      const session = { ytOauth: { state: "teststate", codeVerifier: "testverifier", expiresAt: Date.now() + 60000 } };

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(ValidationError);
      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(/access_denied/);
    });

    it("throws ValidationError when code or state is missing", async () => {
      const session = { ytOauth: { state: "teststate", codeVerifier: "testverifier", expiresAt: Date.now() + 60000 } };

      await expect(oauth.validateAndExchangeCode({}, session)).rejects.toThrow(/Missing OAuth state/);
      await expect(oauth.validateAndExchangeCode({ code: "123" }, session)).rejects.toThrow(/Missing OAuth state/);
      await expect(oauth.validateAndExchangeCode({ state: "teststate" }, session)).rejects.toThrow(/Missing OAuth state/);
    });

    it("throws ValidationError when session oauth data is missing", async () => {
      const query = { code: "test_code", state: "test_state" };
      const session = {};

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(/OAuth session expired/);
    });

    it("throws ValidationError when state does not match session", async () => {
      const query = { code: "test_code", state: "wrong_state" };
      const session = {
        ytOauth: { state: "correct_state", codeVerifier: "testverifier", expiresAt: Date.now() + 60000 },
      };

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(/OAuth state mismatch/);
    });

    it("throws ValidationError when session oauth data has expired", async () => {
      const query = { code: "test_code", state: "expired_state" };
      const session = {
        ytOauth: { state: "expired_state", codeVerifier: "testverifier", expiresAt: Date.now() - 1000 },
      };

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(/OAuth state mismatch or expired/);
    });

    it("successfully exchanges authorization code and returns tokens", async () => {
      const query = { code: "valid_auth_code", state: "matching_state" };
      const session = {
        ytOauth: { state: "matching_state", codeVerifier: "my_code_verifier", expiresAt: Date.now() + 60000 },
      };

      let capturedBody = null;
      global.fetch = jest.fn().mockImplementation(async (url, opts) => {
        if (url === "https://oauth2.googleapis.com/token") {
          capturedBody = new URLSearchParams(opts.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "mock_access_token_123",
              refresh_token: "mock_refresh_token_456",
              expires_in: 3599,
              scope: "https://www.googleapis.com/auth/youtube.force-ssl",
              token_type: "Bearer",
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const result = await oauth.validateAndExchangeCode(query, session);

      expect(result).toEqual({
        accessToken: "mock_access_token_123",
        refreshToken: "mock_refresh_token_456",
        expiresIn: 3599,
        scopes: ["https://www.googleapis.com/auth/youtube.force-ssl"],
      });

      expect(capturedBody.get("grant_type")).toBe("authorization_code");
      expect(capturedBody.get("code")).toBe("valid_auth_code");
      expect(capturedBody.get("code_verifier")).toBe("my_code_verifier");
      expect(capturedBody.get("client_id")).toBe("mock-google-client-id.apps.googleusercontent.com");
      expect(session.ytOauth).toBeUndefined(); // Session was cleared
    });

    it("throws YouTubeApiError when Google token exchange endpoint fails", async () => {
      const query = { code: "bad_code", state: "matching_state" };
      const session = {
        ytOauth: { state: "matching_state", codeVerifier: "my_code_verifier", expiresAt: Date.now() + 60000 },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_grant", error_description: "Bad code" }),
      });

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(YouTubeApiError);
    });

    it("throws ValidationError when Google does not return a refresh token", async () => {
      const query = { code: "valid_code", state: "matching_state" };
      const session = {
        ytOauth: { state: "matching_state", codeVerifier: "my_code_verifier", expiresAt: Date.now() + 60000 },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "access_only_token",
          // refresh_token missing!
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube.force-ssl",
        }),
      });

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(/Google did not return a refresh token/);
    });

    it("throws ValidationError when required youtube.force-ssl scope was not granted", async () => {
      const query = { code: "valid_code", state: "matching_state" };
      const session = {
        ytOauth: { state: "matching_state", codeVerifier: "my_code_verifier", expiresAt: Date.now() + 60000 },
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "access_token",
          refresh_token: "refresh_token",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/youtube.readonly", // Missing force-ssl
        }),
      });

      await expect(oauth.validateAndExchangeCode(query, session)).rejects.toThrow(/youtube.force-ssl/);
    });
  });

  describe("refreshAccessToken", () => {
    it("successfully refreshes access token using refresh token", async () => {
      let capturedBody = null;
      global.fetch = jest.fn().mockImplementation(async (url, opts) => {
        if (url === "https://oauth2.googleapis.com/token") {
          capturedBody = new URLSearchParams(opts.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "refreshed_access_token_789",
              expires_in: 3600,
              token_type: "Bearer",
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const res = await oauth.refreshAccessToken("my_refresh_token_123");

      expect(res).toEqual({
        accessToken: "refreshed_access_token_789",
        expiresIn: 3600,
      });
      expect(capturedBody.get("grant_type")).toBe("refresh_token");
      expect(capturedBody.get("refresh_token")).toBe("my_refresh_token_123");
    });

    it("throws YouTubeApiError with reason invalid_grant when refresh token is revoked/expired", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        }),
      });

      try {
        await oauth.refreshAccessToken("bad_refresh_token");
        throw new Error("Should have thrown YouTubeApiError");
      } catch (err) {
        expect(err).toBeInstanceOf(YouTubeApiError);
        expect(err.ytReason).toBe("invalid_grant");
        expect(err.message).toMatch(/expired or was revoked/);
      }
    });
  });

  describe("revokeToken", () => {
    it("calls Google revoke endpoint with the token parameter", async () => {
      let calledUrl = null;
      let capturedBody = null;
      global.fetch = jest.fn().mockImplementation(async (url, opts) => {
        calledUrl = url;
        capturedBody = new URLSearchParams(opts.body);
        return { ok: true, status: 200, json: async () => ({}) };
      });

      await oauth.revokeToken("token_to_revoke");

      expect(calledUrl).toBe("https://oauth2.googleapis.com/revoke");
      expect(capturedBody.get("token")).toBe("token_to_revoke");
    });

    it("handles fetch errors gracefully without throwing", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

      await expect(oauth.revokeToken("token_to_revoke")).resolves.toBeUndefined();
    });
  });
});
