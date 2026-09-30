const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const ruleService = require("../../src/services/ruleService");
const { Reel } = require("../../src/models/Reel");
const { NotFoundError, ConflictError } = require("../../src/lib/errors");

describe("Rule Service Unit/Integration Tests", () => {
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
    await Reel.deleteMany({});
  });

  it("creates and retrieves a rule by mediaId and id", async () => {
    const created = await ruleService.createRule({
      mediaId: "123456789",
      keywords: ["test"],
      link: "https://example.com",
      active: true,
    });

    expect(created._id).toBeDefined();
    expect(created.mediaId).toBe("123456789");

    const foundByMedia = await ruleService.findRuleByMediaId("123456789");
    expect(foundByMedia).not.toBeNull();
    expect(foundByMedia.link).toBe("https://example.com");

    const foundById = await ruleService.findRuleById(created._id.toString());
    expect(foundById.mediaId).toBe("123456789");
  });

  it("throws ConflictError when creating rule with duplicate mediaId", async () => {
    await ruleService.createRule({
      mediaId: "123456789",
      keywords: ["test"],
      link: "https://example.com",
    });

    await expect(
      ruleService.createRule({
        mediaId: "123456789",
        keywords: ["other"],
        link: "https://example.com/other",
      })
    ).rejects.toThrow(ConflictError);
  });

  it("throws NotFoundError when finding or updating non-existent rule", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();

    await expect(ruleService.findRuleById(fakeId)).rejects.toThrow(NotFoundError);
    await expect(ruleService.updateRule(fakeId, { link: "https://example.com" })).rejects.toThrow(
      NotFoundError
    );
    await expect(ruleService.deleteRule(fakeId)).rejects.toThrow(NotFoundError);
  });

  it("updates and toggles active state of a rule", async () => {
    const rule = await ruleService.createRule({
      mediaId: "987654321",
      keywords: ["launch"],
      link: "https://example.com/initial",
      active: true,
    });

    const updated = await ruleService.updateRule(rule._id.toString(), {
      link: "https://example.com/updated",
    });
    expect(updated.link).toBe("https://example.com/updated");

    const toggledOff = await ruleService.toggleRuleActive(rule._id.toString());
    expect(toggledOff.active).toBe(false);

    const toggledOn = await ruleService.toggleRuleActive(rule._id.toString());
    expect(toggledOn.active).toBe(true);

    const rules = await ruleService.listRules();
    expect(rules.length).toBe(1);

    const deleted = await ruleService.deleteRule(rule._id.toString());
    expect(deleted).toBe(true);

    const afterDelete = await ruleService.listRules();
    expect(afterDelete.length).toBe(0);
  });

  it("returns null when findRuleByMediaId receives empty input", async () => {
    const result = await ruleService.findRuleByMediaId("");
    expect(result).toBeNull();
  });
});
