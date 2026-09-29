const { startDb, stopDb, clearDb } = require("../setupDb");
const { Reel } = require("../../src/models/Reel");
const { ReplyLog } = require("../../src/models/ReplyLog");
const pipeline = require("../../src/services/pipeline");
const instagramClient = require("../../src/services/instagramClient");
const { InstagramApiError } = require("../../src/lib/errors");

beforeAll(async () => {
  await startDb();
  await Reel.init();
  await ReplyLog.init();
});

afterAll(async () => {
  await stopDb();
});

beforeEach(async () => {
  await clearDb();
  jest.restoreAllMocks();
});

describe("Reply Pipeline Integration", () => {
  const mediaIdA = "17890000000000001";
  const mediaIdB = "17890000000000002";

  it("skips event when no rule exists for media ID", async () => {
    const sendSpy = jest.spyOn(instagramClient, "sendPrivateReply");

    const result = await pipeline.processCommentEvent({
      commentId: "c_norule",
      mediaId: "99999999999999",
      text: "LINK please",
      commenterId: "user_1",
      commenterUsername: "user1",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(result).toEqual({ status: "skipped", reason: "no_rule" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips event when rule is inactive", async () => {
    await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/a",
      active: false,
    });

    const sendSpy = jest.spyOn(instagramClient, "sendPrivateReply");

    const result = await pipeline.processCommentEvent({
      commentId: "c_inactive",
      mediaId: mediaIdA,
      text: "LINK",
      commenterId: "user_1",
      commenterUsername: "user1",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(result).toEqual({ status: "skipped", reason: "inactive" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("skips event when comment does not match keywords", async () => {
    await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/a",
      active: true,
    });

    const sendSpy = jest.spyOn(instagramClient, "sendPrivateReply");

    const result = await pipeline.processCommentEvent({
      commentId: "c_nomatch",
      mediaId: mediaIdA,
      text: "nice picture!",
      commenterId: "user_1",
      commenterUsername: "user1",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(result).toEqual({ status: "skipped", reason: "no_match" });
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("successfully matches keyword, sends DM, updates stats and log", async () => {
    const reel = await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/course",
      active: true,
    });

    const sendSpy = jest.spyOn(instagramClient, "sendPrivateReply").mockResolvedValue({
      recipient_id: "user_1",
      message_id: "mid_success_123",
    });

    const result = await pipeline.processCommentEvent({
      commentId: "c_success_1",
      mediaId: mediaIdA,
      text: "Send me the LINK please",
      commenterId: "user_1",
      commenterUsername: "superfan",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(result).toEqual({ status: "sent", messageId: "mid_success_123" });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      "c_success_1",
      expect.stringContaining("https://example.com/course")
    );

    // Verify ReplyLog in database
    const log = await ReplyLog.findOne({ commentId: "c_success_1" });
    expect(log).toBeDefined();
    expect(log.status).toBe("sent");
    expect(log.messageId).toBe("mid_success_123");
    expect(log.matchedKeyword).toBe("link");
    expect(log.attempts).toBe(1);

    // Verify stats on Reel
    const updatedReel = await Reel.findById(reel._id);
    expect(updatedReel.stats.matched).toBe(1);
    expect(updatedReel.stats.sent).toBe(1);
    expect(updatedReel.stats.failed).toBe(0);
  });

  it("enforces commentId idempotency when same comment is processed twice", async () => {
    await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/course",
      active: true,
    });

    const sendSpy = jest.spyOn(instagramClient, "sendPrivateReply").mockResolvedValue({
      recipient_id: "user_1",
      message_id: "mid_success_456",
    });

    const event = {
      commentId: "c_idempotent_test",
      mediaId: mediaIdA,
      text: "LINK",
      commenterId: "user_1",
      commenterUsername: "superfan",
      commentedAt: new Date(),
      receivedAt: new Date(),
    };

    const firstRun = await pipeline.processCommentEvent(event);
    expect(firstRun.status).toBe("sent");

    // Second execution with identical commentId
    const secondRun = await pipeline.processCommentEvent(event);
    expect(secondRun.status).toBe("duplicate");

    // Send API should only have been called ONCE
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("skips duplicate DM when same user comments multiple times on same reel", async () => {
    await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/course",
      active: true,
    });

    jest.spyOn(instagramClient, "sendPrivateReply").mockResolvedValue({
      recipient_id: "user_repeat",
      message_id: "mid_repeat_1",
    });

    // User comments first time
    const res1 = await pipeline.processCommentEvent({
      commentId: "c_first_comment",
      mediaId: mediaIdA,
      text: "LINK",
      commenterId: "user_repeat",
      commenterUsername: "user_repeat",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });
    expect(res1.status).toBe("sent");

    // Same user comments second time with different commentId
    const res2 = await pipeline.processCommentEvent({
      commentId: "c_second_comment",
      mediaId: mediaIdA,
      text: "LINK again",
      commenterId: "user_repeat",
      commenterUsername: "user_repeat",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(res2.status).toBe("skipped");
    expect(res2.reason).toBe("duplicate_user");
  });

  it("retries transient failures and marks sent when retry succeeds", async () => {
    await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/course",
      active: true,
    });

    // Fails on 1st call, succeeds on 2nd call
    const sendSpy = jest
      .spyOn(instagramClient, "sendPrivateReply")
      .mockRejectedValueOnce(
        new InstagramApiError("Rate limit reached", 429, 32, undefined, "transient")
      )
      .mockResolvedValueOnce({
        recipient_id: "user_1",
        message_id: "mid_retry_success",
      });

    const result = await pipeline.processCommentEvent({
      commentId: "c_retry_success",
      mediaId: mediaIdA,
      text: "LINK",
      commenterId: "user_1",
      commenterUsername: "user1",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(result.status).toBe("sent");
    expect(sendSpy).toHaveBeenCalledTimes(2);

    const log = await ReplyLog.findOne({ commentId: "c_retry_success" });
    expect(log.status).toBe("sent");
    expect(log.attempts).toBe(2);
  });

  it("does not retry permanent errors and marks log as failed", async () => {
    const reel = await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/course",
      active: true,
    });

    const sendSpy = jest
      .spyOn(instagramClient, "sendPrivateReply")
      .mockRejectedValue(
        new InstagramApiError("Comment older than 7 days", 400, 100, 2534014, "permanent")
      );

    const result = await pipeline.processCommentEvent({
      commentId: "c_perm_fail",
      mediaId: mediaIdA,
      text: "LINK",
      commenterId: "user_1",
      commenterUsername: "user1",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });

    expect(result.status).toBe("failed");
    expect(sendSpy).toHaveBeenCalledTimes(1); // No retries for permanent errors

    const log = await ReplyLog.findOne({ commentId: "c_perm_fail" });
    expect(log.status).toBe("failed");
    expect(log.attempts).toBe(1);
    expect(log.errorCode).toBe("100");

    const updatedReel = await Reel.findById(reel._id);
    expect(updatedReel.stats.failed).toBe(1);
  });

  it("routes two different reels with different keywords without crossover", async () => {
    await Reel.create({
      mediaId: mediaIdA,
      keywords: ["link"],
      link: "https://example.com/reel-a",
      active: true,
    });

    await Reel.create({
      mediaId: mediaIdB,
      keywords: ["guide"],
      link: "https://example.com/reel-b",
      active: true,
    });

    const sendSpy = jest.spyOn(instagramClient, "sendPrivateReply").mockResolvedValue({
      recipient_id: "user_test",
      message_id: "mid_multi",
    });

    // Comment "guide" on Reel A -> should NOT match
    const resA = await pipeline.processCommentEvent({
      commentId: "c_multi_1",
      mediaId: mediaIdA,
      text: "guide please",
      commenterId: "user_a",
      commenterUsername: "user_a",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });
    expect(resA.status).toBe("skipped");

    // Comment "guide" on Reel B -> MATCHES Reel B
    const resB = await pipeline.processCommentEvent({
      commentId: "c_multi_2",
      mediaId: mediaIdB,
      text: "guide please",
      commenterId: "user_b",
      commenterUsername: "user_b",
      commentedAt: new Date(),
      receivedAt: new Date(),
    });
    expect(resB.status).toBe("sent");
    expect(sendSpy).toHaveBeenCalledWith(
      "c_multi_2",
      expect.stringContaining("https://example.com/reel-b")
    );
  });
});
