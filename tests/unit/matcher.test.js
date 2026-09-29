const { matchComment, normalizeText } = require("../../src/services/matcher");

describe("Keyword Matcher Service", () => {
  describe("Test Matrix from 11-TESTING.md", () => {
    const keyword = "link";

    // Test matrix rows: [comment, wordMatch, exactMatch, containsMatch]
    const testCases = [
      { comment: "LINK", word: true, exact: true, contains: true },
      { comment: "link please", word: true, exact: false, contains: true },
      { comment: "Link!!!", word: true, exact: true, contains: true },
      { comment: "linkedin profile", word: false, exact: false, contains: true },
      { comment: "send me the LINK 🙏", word: true, exact: false, contains: true },
      { comment: "l1nk", word: false, exact: false, contains: false },
      { comment: "   ", word: false, exact: false, contains: false },
      { comment: "🙏❤️✨", word: false, exact: false, contains: false },
      { comment: "  LiNk  ", word: true, exact: true, contains: true },
    ];

    testCases.forEach(({ comment, word, exact, contains }) => {
      it(`evaluates "${comment}" correctly across all match modes`, () => {
        const wordResult = matchComment(comment, [keyword], "word");
        const exactResult = matchComment(comment, [keyword], "exact");
        const containsResult = matchComment(comment, [keyword], "contains");

        expect(wordResult !== null).toBe(word);
        expect(exactResult !== null).toBe(exact);
        expect(containsResult !== null).toBe(contains);

        if (word) expect(wordResult).toBe("link");
        if (exact) expect(exactResult).toBe("link");
        if (contains) expect(containsResult).toBe("link");
      });
    });
  });

  describe("Multi-keyword Matching", () => {
    const keywords = ["link", "guide", "freebook"];

    it("matches any of the configured keywords", () => {
      expect(matchComment("send me the guide please", keywords, "word")).toBe("guide");
      expect(matchComment("LINK", keywords, "word")).toBe("link");
      expect(matchComment("freebook!!!", keywords, "word")).toBe("freebook");
    });

    it("returns null when none of the keywords match", () => {
      expect(matchComment("nice video", keywords, "word")).toBeNull();
    });
  });

  describe("Unicode & Edge Cases", () => {
    it("handles Unicode NFKC normalization", () => {
      // ℓ (U+2113 script small l) normalizes to 'l' under NFKC
      expect(normalizeText("ℓink")).toBe("link");
    });

    it("handles null, undefined or empty keywords safely", () => {
      expect(matchComment("link", [], "word")).toBeNull();
      expect(matchComment("link", null, "word")).toBeNull();
      expect(matchComment(null, ["link"], "word")).toBeNull();
    });
  });
});
