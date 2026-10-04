const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const ruleService = require("../../src/services/youtube/ruleService");
const { YtVideoRule } = require("../../src/models/YtVideoRule");
const { ValidationError, NotFoundError, ConflictError } = require("../../src/lib/errors");

describe("YouTube Rule Service (Phase Y3)", () => {
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
  });

  describe("createRule", () => {
    it("creates a rule with normalized keywords, HTTPS link, and cursor lastSeenAt = now (backfill=false)", async () => {
      const beforeTime = Date.now();
      const rule = await ruleService.createRule({
        videoId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        keywords: [" LINK ", "Song", "link"],
        link: "https://example.com/target",
        matchMode: "word",
        backfill: false,
      });

      expect(rule.videoId).toBe("dQw4w9WgXcQ");
      expect(rule.keywords).toEqual(["link", "song"]);
      expect(rule.link).toBe("https://example.com/target");
      expect(rule.matchMode).toBe("word");
      expect(rule.active).toBe(true);
      expect(rule.cursor.lastSeenAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
    });

    it("initializes cursor.lastSeenAt to 7 days ago when backfill=true", async () => {
      const sevenDaysAgoEst = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const rule = await ruleService.createRule({
        videoId: "backfill001",
        keywords: ["guide"],
        link: "https://example.com/guide",
        backfill: true,
      });

      expect(rule.backfill).toBe(true);
      expect(Math.abs(rule.cursor.lastSeenAt.getTime() - sevenDaysAgoEst)).toBeLessThan(5000);
    });

    it("throws ConflictError when a rule for the video ID already exists", async () => {
      await ruleService.createRule({
        videoId: "uniqVid0001",
        keywords: ["first"],
        link: "https://example.com/1",
      });

      await expect(
        ruleService.createRule({
          videoId: "https://youtu.be/uniqVid0001",
          keywords: ["second"],
          link: "https://example.com/2",
        })
      ).rejects.toThrow(ConflictError);
    });

    it("throws ValidationError for non-HTTPS destination links", async () => {
      await expect(
        ruleService.createRule({
          videoId: "validVid002",
          keywords: ["link"],
          link: "http://insecure-link.com",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for empty or invalid keywords", async () => {
      await expect(
        ruleService.createRule({
          videoId: "validVid003",
          keywords: [],
          link: "https://example.com",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("getRuleById & getRuleByVideoId", () => {
    it("retrieves rule by valid ObjectId and videoId", async () => {
      const created = await ruleService.createRule({
        videoId: "lookVid0001",
        keywords: ["test"],
        link: "https://example.com",
      });

      const byId = await ruleService.getRuleById(created._id.toString());
      expect(byId.videoId).toBe("lookVid0001");

      const byVideoId = await ruleService.getRuleByVideoId("lookVid0001");
      expect(byVideoId._id.toString()).toBe(created._id.toString());
    });

    it("throws NotFoundError when rule ID does not exist", async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      await expect(ruleService.getRuleById(nonExistentId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("toggleRule & Reactivation Cursor Reset", () => {
    it("toggles rule active status and resets cursor.lastSeenAt to now when resumed from paused", async () => {
      const rule = await ruleService.createRule({
        videoId: "togglVid001",
        keywords: ["test"],
        link: "https://example.com",
      });

      expect(rule.active).toBe(true);

      // Pause rule
      const paused = await ruleService.toggleRule(rule._id.toString());
      expect(paused.active).toBe(false);

      // Artificially age the cursor to simulate past time
      paused.cursor.lastSeenAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await paused.save();

      // Resume rule
      const resumedTime = Date.now();
      const resumed = await ruleService.toggleRule(rule._id.toString());
      expect(resumed.active).toBe(true);
      expect(resumed.cursor.lastSeenAt.getTime()).toBeGreaterThanOrEqual(resumedTime - 100);
    });
  });

  describe("updateRule & deleteRule", () => {
    it("updates rule keywords, link, and matchMode", async () => {
      const rule = await ruleService.createRule({
        videoId: "updatVid001",
        keywords: ["old"],
        link: "https://example.com/old",
      });

      const updated = await ruleService.updateRule(rule._id.toString(), {
        keywords: ["new1", "new2"],
        link: "https://example.com/new",
        matchMode: "exact",
      });

      expect(updated.keywords).toEqual(["new1", "new2"]);
      expect(updated.link).toBe("https://example.com/new");
      expect(updated.matchMode).toBe("exact");
    });

    it("deletes rule from database", async () => {
      const rule = await ruleService.createRule({
        videoId: "deletVid001",
        keywords: ["bye"],
        link: "https://example.com",
      });

      await ruleService.deleteRule(rule._id.toString());

      const found = await ruleService.getRuleByVideoId("deletVid001");
      expect(found).toBeNull();
    });
  });
});
