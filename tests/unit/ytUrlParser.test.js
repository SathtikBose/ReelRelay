const { parseYouTubeVideoId } = require("../../src/services/youtube/urlParser");

describe("YouTube URL & Video ID Parser (Phase Y3)", () => {
  it("parses standard watch URLs", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be short URLs", () => {
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("http://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses YouTube Shorts URLs", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe("dQw4w9WgXcQ");
  });

  it("parses YouTube Embed and nocookie URLs", () => {
    expect(parseYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses raw 11-character video IDs", () => {
    expect(parseYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
    expect(parseYouTubeVideoId("1234567890a")).toBe("1234567890a");
    expect(parseYouTubeVideoId("_-abcXYZ123")).toBe("_-abcXYZ123");
  });

  it("returns null for invalid inputs", () => {
    expect(parseYouTubeVideoId("")).toBeNull();
    expect(parseYouTubeVideoId(null)).toBeNull();
    expect(parseYouTubeVideoId(undefined)).toBeNull();
    expect(parseYouTubeVideoId(12345)).toBeNull();
    expect(parseYouTubeVideoId("invalid_id")).toBeNull();
    expect(parseYouTubeVideoId("https://instagram.com/p/1234567890/")).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/watch?v=too_short")).toBeNull();
    expect(parseYouTubeVideoId("https://www.youtube.com/channel/UC123456")).toBeNull();
  });
});
