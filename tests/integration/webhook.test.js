const request = require("supertest");
const { createApp } = require("../../src/app");
const { computeSignature } = require("../../src/services/webhookValidator");
const { env } = require("../../src/config/env");
const commentFixture = require("../fixtures/commentPayload.json");
const pipeline = require("../../src/services/pipeline");

describe("Webhook Routes Integration", () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  describe("GET /webhook (Handshake)", () => {
    it("returns 200 with challenge when mode=subscribe and verify_token matches", async () => {
      const challenge = "test_challenge_code_98765";

      const res = await request(app)
        .get("/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": env.IG_VERIFY_TOKEN,
          "hub.challenge": challenge,
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe(challenge);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
    });

    it("returns 403 when verify_token is incorrect", async () => {
      const res = await request(app)
        .get("/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong_token_value",
          "hub.challenge": "test_challenge",
        });

      expect(res.status).toBe(403);
      expect(res.text).toBe("Forbidden");
    });

    it("returns 403 when mode is not subscribe", async () => {
      const res = await request(app)
        .get("/webhook")
        .query({
          "hub.mode": "unsubscribe",
          "hub.verify_token": env.IG_VERIFY_TOKEN,
          "hub.challenge": "test_challenge",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /webhook (Event Delivery)", () => {
    it("accepts valid signature, responds 200 { received: true } immediately, and enqueues event", async () => {
      const enqueueSpy = jest.spyOn(pipeline, "enqueue");
      const bodyString = JSON.stringify(commentFixture);
      const signature = `sha256=${computeSignature(bodyString, env.IG_APP_SECRET)}`;

      const res = await request(app)
        .post("/webhook")
        .set("x-hub-signature-256", signature)
        .set("content-type", "application/json")
        .send(bodyString);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          commentId: "comment_1001",
          text: "LINK please",
        })
      );

      enqueueSpy.mockRestore();
    });

    it("rejects request with 401 when signature header is missing", async () => {
      const res = await request(app)
        .post("/webhook")
        .set("content-type", "application/json")
        .send(commentFixture);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects request with 401 when signature is invalid", async () => {
      const res = await request(app)
        .post("/webhook")
        .set("x-hub-signature-256", "sha256=invalid_signature_hex_0123456789abcdef0123456789abcdef0123456789")
        .set("content-type", "application/json")
        .send(commentFixture);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("handles unexpected body structure gracefully without crashing", async () => {
      const malformed = { random: "payload" };
      const bodyString = JSON.stringify(malformed);
      const signature = `sha256=${computeSignature(bodyString, env.IG_APP_SECRET)}`;

      const res = await request(app)
        .post("/webhook")
        .set("x-hub-signature-256", signature)
        .set("content-type", "application/json")
        .send(bodyString);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });
  });
});
