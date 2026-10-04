const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const pickerService = require("../../src/services/youtube/pickerService");
const credentialService = require("../../src/services/youtube/credentialService");
const ytClient = require("../../src/services/youtube/ytClient");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { YtCredential } = require("../../src/models/YtCredential");
const { UnauthorizedError } = require("../../src/lib/errors");

jest.mock("../../src/services/youtube/credentialService");
jest.mock("../../src/services/youtube/ytClient");

describe("YouTube Picker Service (Phase Y3)", () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await YtVideoRule.deleteMany({});
    await YtCredential.deleteMany({});
    pickerService.clearCache();
    jest.clearAllMocks();
  });

  it("throws UnauthorizedError when channel is not connected", async () => {
    credentialService.getCredential.mockResolvedValue(null);

    await expect(pickerService.getVideosList()).rejects.toThrow(UnauthorizedError);
  });

  it("fetches, enriches, annotates hasRule, and caches results", async () => {
    credentialService.getCredential.mockResolvedValue({
      status: "connected",
      uploadsPlaylistId: "UU_Uploads_999",
    });
    credentialService.getAccessToken.mockResolvedValue("mock_token_123");

    // Existing rule in DB for video 1
    await YtVideoRule.create({
      videoId: "vid00000001",
      title: "Existing Video 1",
      keywords: ["link"],
      link: "https://example.com/1",
    });

    ytClient.listUploads.mockResolvedValue({
      items: [
        {
          videoId: "vid00000001",
          title: "Video 1",
          thumbnailUrl: "https://i.ytimg.com/vi/vid00000001/hqdefault.jpg",
          publishedAt: new Date("2026-10-01T10:00:00Z"),
        },
        {
          videoId: "vid00000002",
          title: "Video 2",
          thumbnailUrl: "https://i.ytimg.com/vi/vid00000002/hqdefault.jpg",
          publishedAt: new Date("2026-10-02T10:00:00Z"),
        },
      ],
      nextPageToken: "next_page_token",
      prevPageToken: null,
      totalResults: 2,
    });

    ytClient.getVideos.mockResolvedValue([
      { videoId: "vid00000001", durationSec: 45, isShort: true },
      { videoId: "vid00000002", durationSec: 300, isShort: false },
    ]);

    const result1 = await pickerService.getVideosList();

    expect(result1.cached).toBe(false);
    expect(result1.items).toHaveLength(2);
    expect(result1.items[0].videoId).toBe("vid00000001");
    expect(result1.items[0].hasRule).toBe(true);
    expect(result1.items[0].isShort).toBe(true);

    expect(result1.items[1].videoId).toBe("vid00000002");
    expect(result1.items[1].hasRule).toBe(false);
    expect(result1.items[1].isShort).toBe(false);

    expect(ytClient.listUploads).toHaveBeenCalledTimes(1);

    // Second call should return from cache
    const result2 = await pickerService.getVideosList();
    expect(result2.cached).toBe(true);
    expect(ytClient.listUploads).toHaveBeenCalledTimes(1); // Not called again
  });

  it("forces cache bypass when refresh is true", async () => {
    credentialService.getCredential.mockResolvedValue({
      status: "connected",
      uploadsPlaylistId: "UU_Uploads_999",
    });
    credentialService.getAccessToken.mockResolvedValue("mock_token_123");

    ytClient.listUploads.mockResolvedValue({ items: [], totalResults: 0 });
    ytClient.getVideos.mockResolvedValue([]);

    await pickerService.getVideosList();
    expect(ytClient.listUploads).toHaveBeenCalledTimes(1);

    await pickerService.getVideosList({ refresh: true });
    expect(ytClient.listUploads).toHaveBeenCalledTimes(2);
  });
});
