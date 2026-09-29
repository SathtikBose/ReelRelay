const instagramClient = require("../../src/services/instagramClient");
const tokenService = require("../../src/services/tokenService");
const { InstagramApiError } = require("../../src/lib/errors");

describe("Instagram Client Service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(tokenService, "getDecryptedToken").mockResolvedValue("test_access_token_123");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("classifyError()", () => {
    it("classifies code 190 as auth error", () => {
      expect(instagramClient.classifyError(400, 190, undefined, "Invalid OAuth access token")).toBe("auth");
      expect(instagramClient.classifyError(400, undefined, 463, "Token expired")).toBe("auth");
    });

    it("classifies rate limits and 5xx as transient errors", () => {
      expect(instagramClient.classifyError(429, 32, undefined, "Page rate limit")).toBe("transient");
      expect(instagramClient.classifyError(500, undefined, undefined, "Internal server error")).toBe("transient");
      expect(instagramClient.classifyError(503, undefined, undefined, "Service unavailable")).toBe("transient");
      expect(instagramClient.classifyError(200, 4, undefined, "App limit")).toBe("transient");
    });

    it("classifies client errors and invalid comment ID as permanent errors", () => {
      expect(instagramClient.classifyError(400, 100, undefined, "Unsupported post request")).toBe("permanent");
      expect(instagramClient.classifyError(403, 10, undefined, "Permission denied")).toBe("permanent");
    });
  });

  describe("sendPrivateReply()", () => {
    it("sends private reply request and returns message ID on success", async () => {
      const mockResponse = { recipient_id: "user_123", message_id: "mid.123456789" };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => mockResponse,
      });

      const result = await instagramClient.sendPrivateReply("comment_999", "Here is your link: https://example.com");

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOptions] = global.fetch.mock.calls[0];
      expect(calledUrl).toContain("/messages");
      expect(calledOptions.method).toBe("POST");
      expect(JSON.parse(calledOptions.body)).toEqual({
        recipient: { comment_id: "comment_999" },
        message: { text: "Here is your link: https://example.com" },
      });
    });

    it("throws classified InstagramApiError on API failure", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          error: {
            message: "Cannot reply to comment older than 7 days",
            code: 100,
            error_subcode: 2534014,
          },
        }),
      });

      await expect(
        instagramClient.sendPrivateReply("comment_old", "Link text")
      ).rejects.toThrow(InstagramApiError);

      try {
        await instagramClient.sendPrivateReply("comment_old", "Link text");
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.errorType).toBe("permanent");
        expect(err.igCode).toBe(100);
      }
    });

    it("throws InstagramApiError with transient errorType on network error", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("ECONNRESET"));

      await expect(
        instagramClient.sendPrivateReply("comment_123", "Link text")
      ).rejects.toThrow(InstagramApiError);

      try {
        await instagramClient.sendPrivateReply("comment_123", "Link text");
      } catch (err) {
        expect(err.errorType).toBe("transient");
      }
    });

    it("redacts raw token if present in error message", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => "application/json" },
        json: async () => ({
          error: {
            message: "Invalid token EAAB1234567890abcdef provided",
            code: 190,
          },
        }),
      });

      try {
        await instagramClient.sendPrivateReply("comment_123", "Link text");
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err.message).not.toContain("EAAB1234567890abcdef");
        expect(err.message).toContain("[REDACTED_TOKEN]");
      }
    });
  });
});
