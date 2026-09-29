const { startDb, stopDb, clearDb } = require("../setupDb");
const { Reel, DEFAULT_DM_TEMPLATE } = require("../../src/models/Reel");
const { ReplyLog } = require("../../src/models/ReplyLog");
const { Credential } = require("../../src/models/Credential");

beforeAll(async () => {
  await startDb();
  await Reel.init();
  await ReplyLog.init();
  await Credential.init();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  await clearDb();
});

describe("Mongoose Models & Schema Validation", () => {
  describe("Reel Model", () => {
    it("creates a valid reel and normalizes keywords to lowercase and trimmed", async () => {
      const reel = await Reel.create({
        mediaId: "17890123456789012",
        permalink: "https://www.instagram.com/reel/C12345/",
        caption: "Test Reel Caption",
        thumbnailUrl: "https://example.com/thumb.jpg",
        keywords: [" LINK ", "Guide", "link"],
        matchMode: "word",
        link: "https://example.com/target-page",
      });

      expect(reel.mediaId).toBe("17890123456789012");
      expect(reel.keywords).toEqual(["link", "guide"]);
      expect(reel.dmTemplate).toBe(DEFAULT_DM_TEMPLATE);
      expect(reel.active).toBe(true);
      expect(reel.stats).toEqual({ matched: 0, sent: 0, failed: 0 });
    });

    it("enforces unique mediaId constraint", async () => {
      await Reel.create({
        mediaId: "17890123456789012",
        keywords: ["link"],
        link: "https://example.com/1",
      });

      await expect(
        Reel.create({
          mediaId: "17890123456789012",
          keywords: ["guide"],
          link: "https://example.com/2",
        })
      ).rejects.toThrow(/duplicate key error/);
    });

    it("rejects non-digit mediaId", async () => {
      await expect(
        Reel.create({
          mediaId: "invalid_id_with_letters",
          keywords: ["link"],
          link: "https://example.com",
        })
      ).rejects.toThrow(/mediaId must contain digits only/);
    });

    it("rejects non-https links", async () => {
      await expect(
        Reel.create({
          mediaId: "1234567890",
          keywords: ["link"],
          link: "http://example.com/insecure",
        })
      ).rejects.toThrow(/link must be a valid https:\/\/ URL/);

      await expect(
        Reel.create({
          mediaId: "1234567890",
          keywords: ["link"],
          link: "javascript:alert(1)",
        })
      ).rejects.toThrow(/link must be a valid https:\/\/ URL/);
    });

    it("rejects invalid matchMode", async () => {
      await expect(
        Reel.create({
          mediaId: "1234567890",
          keywords: ["link"],
          link: "https://example.com",
          matchMode: "fuzzy",
        })
      ).rejects.toThrow(/matchMode/);
    });

    it("rejects empty keywords array", async () => {
      await expect(
        Reel.create({
          mediaId: "1234567890",
          keywords: [],
          link: "https://example.com",
        })
      ).rejects.toThrow(/Keywords must have between 1 and 10 items/);
    });
  });

  describe("ReplyLog Model", () => {
    it("creates a valid reply log document with defaults", async () => {
      const log = await ReplyLog.create({
        commentId: "comment_12345",
        mediaId: "17890123456789012",
        commenterId: "user_67890",
        commenterUsername: "johndoe",
        commentText: "send link please",
        matchedKeyword: "link",
        status: "processing",
      });

      expect(log.commentId).toBe("comment_12345");
      expect(log.status).toBe("processing");
      expect(log.attempts).toBe(0);
      expect(log.createdAt).toBeInstanceOf(Date);
    });

    it("enforces unique commentId for idempotency", async () => {
      await ReplyLog.create({
        commentId: "unique_comment_id_1",
        mediaId: "123",
        status: "processing",
      });

      await expect(
        ReplyLog.create({
          commentId: "unique_comment_id_1",
          mediaId: "123",
          status: "processing",
        })
      ).rejects.toThrow(/duplicate key error/);
    });

    it("truncates commentText to 300 characters", async () => {
      const longComment = "a".repeat(500);
      const log = await ReplyLog.create({
        commentId: "comment_long",
        commentText: longComment,
      });

      expect(log.commentText.length).toBe(300);
      expect(log.commentText).toBe("a".repeat(300));
    });

    it("enforces status and skipReason enums", async () => {
      await expect(
        ReplyLog.create({
          commentId: "comment_bad_status",
          status: "unknown_status",
        })
      ).rejects.toThrow(/status must be/);

      await expect(
        ReplyLog.create({
          commentId: "comment_bad_skip",
          status: "skipped",
          skipReason: "invalid_reason",
        })
      ).rejects.toThrow(/Invalid skipReason/);
    });

    it("has TTL index configured on createdAt", () => {
      const indexes = ReplyLog.schema.indexes();
      const ttlIndex = indexes.find(
        ([fields, options]) => fields.createdAt === 1 && options && options.expireAfterSeconds !== undefined
      );

      expect(ttlIndex).toBeDefined();
      expect(ttlIndex[1].expireAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("Credential Model", () => {
    it("creates valid credential with default key='instagram'", async () => {
      const cred = await Credential.create({
        tokenCipher: "cipher_base64",
        tokenIv: "iv_base64",
        tokenTag: "tag_base64",
        igUserId: "17841400000000000",
      });

      expect(cred.key).toBe("instagram");
      expect(cred.tokenCipher).toBe("cipher_base64");
    });

    it("enforces unique key constraint (singleton)", async () => {
      await Credential.create({
        tokenCipher: "cipher1",
        tokenIv: "iv1",
        tokenTag: "tag1",
      });

      await expect(
        Credential.create({
          tokenCipher: "cipher2",
          tokenIv: "iv2",
          tokenTag: "tag2",
        })
      ).rejects.toThrow(/duplicate key error/);
    });
  });
});
