const { callYtApi, getMyChannel } = require("../../src/services/youtube/ytClient");
const { YouTubeApiError, NotFoundError } = require("../../src/lib/errors");

describe("YouTube Client (Phase Y2)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("callYtApi", () => {
    it("makes an authenticated GET request and returns parsed JSON", async () => {
      let capturedUrl = "";
      let capturedHeaders = {};

      global.fetch = jest.fn().mockImplementation(async (url, opts) => {
        capturedUrl = url;
        capturedHeaders = opts.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [{ id: "test1" }] }),
        };
      });

      const res = await callYtApi("/test-endpoint", "mock_access_token_123");

      expect(capturedUrl).toBe("https://www.googleapis.com/youtube/v3/test-endpoint");
      expect(capturedHeaders.Authorization).toBe("Bearer mock_access_token_123");
      expect(res).toEqual({ items: [{ id: "test1" }] });
    });

    it("classifies 401 as auth errorType", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: "Invalid Credentials",
            errors: [{ reason: "authError" }],
          },
        }),
      });

      try {
        await callYtApi("/channels", "invalid_token");
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(YouTubeApiError);
        expect(err.statusCode).toBe(401);
        expect(err.errorType).toBe("auth");
      }
    });

    it("classifies quotaExceeded as quota errorType", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: "Quota exceeded for quota metric",
            errors: [{ reason: "quotaExceeded" }],
          },
        }),
      });

      try {
        await callYtApi("/channels", "token");
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(YouTubeApiError);
        expect(err.errorType).toBe("quota");
        expect(err.ytReason).toBe("quotaExceeded");
      }
    });

    it("classifies 404 / 400 as permanent errorType", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            message: "Resource not found",
            errors: [{ reason: "videoNotFound" }],
          },
        }),
      });

      try {
        await callYtApi("/videos", "token");
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(YouTubeApiError);
        expect(err.errorType).toBe("permanent");
      }
    });

    it("classifies 500 / 503 as transient errorType", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            message: "Backend error",
            errors: [{ reason: "backendError" }],
          },
        }),
      });

      try {
        await callYtApi("/channels", "token");
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(YouTubeApiError);
        expect(err.errorType).toBe("transient");
      }
    });

    it("handles AbortError as timeout error", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      global.fetch = jest.fn().mockRejectedValue(abortError);

      try {
        await callYtApi("/timeout", "token");
        throw new Error("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(YouTubeApiError);
        expect(err.statusCode).toBe(504);
        expect(err.ytReason).toBe("timeout");
      }
    });
  });

  describe("getMyChannel", () => {
    it("returns channel details when items are present", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "UC_Channel_XYZ",
              snippet: {
                title: "My Channel Name",
              },
              contentDetails: {
                relatedPlaylists: {
                  uploads: "UU_Channel_XYZ",
                },
              },
            },
          ],
        }),
      });

      const channel = await getMyChannel("valid_token");
      expect(channel).toEqual({
        channelId: "UC_Channel_XYZ",
        channelTitle: "My Channel Name",
        uploadsPlaylistId: "UU_Channel_XYZ",
      });
    });

    it("throws NotFoundError when items array is empty", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
        }),
      });

      await expect(getMyChannel("valid_token")).rejects.toThrow(NotFoundError);
      await expect(getMyChannel("valid_token")).rejects.toThrow(/No YouTube channel found/);
    });
  });
});
