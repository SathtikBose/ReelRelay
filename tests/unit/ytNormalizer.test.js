const { normalizeComment, normalizeCommentThreads } = require("../../src/services/youtube/normalizer");

describe("YouTube Comment Normalizer (Phase Y4)", () => {
  const sampleRawItem = {
    id: "UgzCommentThreadId123",
    snippet: {
      videoId: "dQw4w9WgXcQ",
      topLevelComment: {
        id: "UgzCommentThreadId123",
        snippet: {
          textOriginal: "Please send me the link! 🔥",
          textDisplay: "Please send me the link! 🔥",
          authorDisplayName: "Alex Developer",
          authorChannelId: {
            value: "UC_Commenter_Channel_999",
          },
          publishedAt: "2026-10-04T08:00:00.000Z",
          likeCount: 5,
        },
      },
    },
  };

  it("normalizes standard comment thread item into clean comment event", () => {
    const result = normalizeComment(sampleRawItem, "UC_MyChannel_123");

    expect(result).toEqual({
      commentId: "UgzCommentThreadId123",
      videoId: "dQw4w9WgXcQ",
      authorChannelId: "UC_Commenter_Channel_999",
      authorName: "Alex Developer",
      commentText: "Please send me the link! 🔥",
      publishedAt: new Date("2026-10-04T08:00:00.000Z"),
      likeCount: 5,
    });
  });

  it("filters out own comments from channel owner", () => {
    const ownComment = {
      ...sampleRawItem,
      snippet: {
        ...sampleRawItem.snippet,
        topLevelComment: {
          ...sampleRawItem.snippet.topLevelComment,
          snippet: {
            ...sampleRawItem.snippet.topLevelComment.snippet,
            authorChannelId: { value: "UC_MyChannel_123" },
          },
        },
      },
    };

    const result = normalizeComment(ownComment, "UC_MyChannel_123");
    expect(result).toBeNull();
  });

  it("filters out empty or whitespace-only comments", () => {
    const emptyComment = {
      ...sampleRawItem,
      snippet: {
        ...sampleRawItem.snippet,
        topLevelComment: {
          ...sampleRawItem.snippet.topLevelComment,
          snippet: {
            ...sampleRawItem.snippet.topLevelComment.snippet,
            textOriginal: "   ",
          },
        },
      },
    };

    expect(normalizeComment(emptyComment)).toBeNull();
  });

  it("filters out null, undefined, or malformed items missing ID", () => {
    expect(normalizeComment(null)).toBeNull();
    expect(normalizeComment({})).toBeNull();
    expect(normalizeComment({ id: "" })).toBeNull();
  });

  it("normalizes an array of items filtering out invalid entries", () => {
    const items = [
      sampleRawItem,
      null,
      { id: "invalid" },
      {
        id: "UgzValid2",
        snippet: {
          videoId: "dQw4w9WgXcQ",
          topLevelComment: {
            snippet: {
              textOriginal: "Awesome video",
              authorDisplayName: "Bob",
              authorChannelId: { value: "UC_Bob" },
              publishedAt: "2026-10-04T09:00:00Z",
            },
          },
        },
      },
    ];

    const results = normalizeCommentThreads(items, "UC_MyChannel_123");
    expect(results).toHaveLength(2);
    expect(results[0].commentId).toBe("UgzCommentThreadId123");
    expect(results[1].commentId).toBe("UgzValid2");
  });
});
