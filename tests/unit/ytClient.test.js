const {
  callYtApi,
  getMyChannel,
  listUploads,
  getVideos,
  listCommentThreads,
  insertReply,
  parseIsoDuration,
} = require("../../src/services/youtube/ytClient");
const { YouTubeApiError, NotFoundError } = require("../../src/lib/errors");

describe("YouTube Client (Phase Y2 & Y3)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("parseIsoDuration", () => {
    it("parses ISO 8601 duration strings into seconds accurately", () => {
      expect(parseIsoDuration("PT45S")).toBe(45);
      expect(parseIsoDuration("PT1M30S")).toBe(90);
      expect(parseIsoDuration("PT3M")).toBe(180);
      expect(parseIsoDuration("PT1H2M10S")).toBe(3730);
      expect(parseIsoDuration("")).toBe(0);
      expect(parseIsoDuration(null)).toBe(0);
      expect(parseIsoDuration("invalid")).toBe(0);
    });
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

  describe("listUploads", () => {
    it("fetches playlistItems and maps them to clean objects", async () => {
      let capturedUrl = "";
      global.fetch = jest.fn().mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                snippet: {
                  title: "Awesome Tutorial Video",
                  description: "Full guide here",
                  publishedAt: "2026-09-30T10:00:00Z",
                  thumbnails: {
                    high: { url: "https://i.ytimg.com/vi/vid12345678/hqdefault.jpg" },
                  },
                },
                contentDetails: {
                  videoId: "vid12345678",
                },
              },
            ],
            nextPageToken: "next_token_abc",
            pageInfo: { totalResults: 42 },
          }),
        };
      });

      const result = await listUploads("token", "UU_Uploads_123", { maxResults: 10, pageToken: "page1" });

      expect(capturedUrl).toContain("playlistId=UU_Uploads_123");
      expect(capturedUrl).toContain("maxResults=10");
      expect(capturedUrl).toContain("pageToken=page1");
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        videoId: "vid12345678",
        title: "Awesome Tutorial Video",
        description: "Full guide here",
        thumbnailUrl: "https://i.ytimg.com/vi/vid12345678/hqdefault.jpg",
        publishedAt: new Date("2026-09-30T10:00:00Z"),
      });
      expect(result.nextPageToken).toBe("next_token_abc");
      expect(result.totalResults).toBe(42);
    });
  });

  describe("getVideos", () => {
    it("returns video details and duration/isShort flag", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "shortVid123",
              snippet: {
                title: "Quick Short #shorts",
                publishedAt: "2026-10-01T12:00:00Z",
                thumbnails: { high: { url: "https://i.ytimg.com/vi/shortVid123/hqdefault.jpg" } },
              },
              contentDetails: {
                duration: "PT45S", // 45 seconds -> isShort = true
              },
            },
            {
              id: "longVid1234",
              snippet: {
                title: "In-Depth Masterclass",
                publishedAt: "2026-10-02T12:00:00Z",
              },
              contentDetails: {
                duration: "PT15M30S", // > 180s -> isShort = false
              },
            },
          ],
        }),
      });

      const videos = await getVideos("token", ["shortVid123", "longVid1234"]);

      expect(videos).toHaveLength(2);
      expect(videos[0].videoId).toBe("shortVid123");
      expect(videos[0].durationSec).toBe(45);
      expect(videos[0].isShort).toBe(true);

      expect(videos[1].videoId).toBe("longVid1234");
      expect(videos[1].durationSec).toBe(930);
      expect(videos[1].isShort).toBe(false);
    });

    it("returns empty array for empty videoIds input", async () => {
      const videos = await getVideos("token", []);
      expect(videos).toEqual([]);
    });
  });

  describe("listCommentThreads", () => {
    it("fetches comment threads ordered by time", async () => {
      let capturedUrl = "";
      global.fetch = jest.fn().mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "thread1",
                snippet: {
                  topLevelComment: {
                    snippet: {
                      textDisplay: "Great video! Link please",
                      textOriginal: "Great video! Link please",
                      authorDisplayName: "Alice",
                      authorChannelId: { value: "UC_Alice" },
                      publishedAt: "2026-10-04T08:00:00Z",
                    },
                  },
                },
              },
            ],
            nextPageToken: "next_comments_page",
          }),
        };
      });

      const res = await listCommentThreads("token", "vid12345678", { maxResults: 20 });

      expect(capturedUrl).toContain("videoId=vid12345678");
      expect(capturedUrl).toContain("order=time");
      expect(capturedUrl).toContain("maxResults=20");
      expect(res.items).toHaveLength(1);
      expect(res.nextPageToken).toBe("next_comments_page");
    });
  });

  describe("insertReply", () => {
    it("posts a comment reply via POST /comments and returns created resource", async () => {
      let capturedBody = null;
      global.fetch = jest.fn().mockImplementation(async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: "reply_comment_id_777",
            snippet: {
              parentId: "parent_comment_123",
              textOriginal: "Here is the link: https://example.com",
              publishedAt: "2026-10-04T08:30:00Z",
            },
          }),
        };
      });

      const reply = await insertReply("token", "parent_comment_123", "Here is the link: https://example.com");

      expect(capturedBody).toEqual({
        snippet: {
          parentId: "parent_comment_123",
          textOriginal: "Here is the link: https://example.com",
        },
      });
      expect(reply).toEqual({
        id: "reply_comment_id_777",
        textOriginal: "Here is the link: https://example.com",
        publishedAt: "2026-10-04T08:30:00Z",
      });
    });
  });
});
