const express = require("express");
const { verifySignature, verifyHandshakeToken } = require("../services/webhookValidator");
const { normalizeWebhookPayload } = require("../services/normalizer");
const { webhookLimiter } = require("../middleware/rateLimiter");
const pipeline = require("../services/pipeline");
const { logger } = require("../lib/logger");

const router = express.Router();

// Apply generous rate limiter to webhook endpoint
router.use("/webhook", webhookLimiter);

/**
 * GET /webhook
 * Meta webhook verification handshake
 */
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyHandshakeToken(token)) {
    logger.info("Meta webhook handshake verified successfully");
    res.set("Content-Type", "text/plain");
    return res.status(200).send(challenge);
  }

  logger.warn({ mode, hasToken: !!token }, "Meta webhook handshake failed");
  return res.status(403).send("Forbidden");
});

/**
 * POST /webhook
 * Instagram event receiver endpoint
 */
router.post("/webhook", (req, res) => {
  const signatureHeader = req.headers["x-hub-signature-256"];
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

  const isValid = verifySignature(rawBody, signatureHeader);
  if (!isValid) {
    logger.warn({ hasSignature: !!signatureHeader }, "Rejecting webhook with invalid signature");
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid webhook signature",
      },
    });
  }

  // Fast 200 OK acknowledgement
  res.status(200).json({ received: true });

  // Asynchronous event processing after acknowledgement
  try {
    const events = normalizeWebhookPayload(req.body);
    for (const event of events) {
      pipeline.enqueue(event);
    }
  } catch (err) {
    logger.error({ err }, "Error processing normalized webhook events");
  }
});

module.exports = router;
