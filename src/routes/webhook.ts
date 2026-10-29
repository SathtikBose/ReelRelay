import { Hono } from "hono";
import { Bindings } from "../index";
import { verifyHandshakeToken, verifyWebhookSignature } from "../lib/crypto";
import { normalizeWebhookPayload, CommentEvent } from "../services/normalizer";
import { logger } from "../lib/logger";

const webhookRouter = new Hono<{ Bindings: Bindings }>();

/**
 * Background worker to process incoming validated comment events.
 * Executed via ctx.waitUntil so the HTTP 200 response to Meta is not delayed.
 */
export async function processCommentEvents(
  events: CommentEvent[],
  env: Bindings
): Promise<void> {
  if (events.length === 0) return;

  for (const event of events) {
    logger.info(
      {
        commentId: event.commentId,
        mediaId: event.mediaId,
        commenterUsername: event.commenterUsername,
        textSnippet: event.text.slice(0, 50),
        commentedAt: event.commentedAt.toISOString(),
      },
      "Enqueued Instagram comment event for delivery pipeline"
    );

    // In Phase 3 (D1) and Phase 4 (DM Sending), this calls the database deduplication,
    // keyword matcher, and Meta Graph API private reply service.
  }
}

/**
 * GET /webhook — Meta Webhook Handshake Verification
 */
webhookRouter.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  const expectedToken = c.env.META_VERIFY_TOKEN || c.env.IG_VERIFY_TOKEN;

  if (mode === "subscribe" && verifyHandshakeToken(token, expectedToken)) {
    logger.info({ mode }, "Meta webhook handshake verified successfully");
    return c.text(challenge || "", 200, {
      "Content-Type": "text/plain",
    });
  }

  logger.warn(
    { mode, hasToken: !!token },
    "Meta webhook handshake verification failed"
  );
  return c.text("Forbidden", 403);
});

/**
 * POST /webhook — Meta Instagram Event Notification Receiver
 */
webhookRouter.post("/webhook", async (c) => {
  const signatureHeader =
    c.req.header("x-hub-signature-256") || c.req.header("x-hub-signature");

  const appSecret = c.env.META_APP_SECRET || c.env.IG_APP_SECRET;

  if (!appSecret) {
    logger.error({}, "Meta App Secret is not configured in environment bindings");
    return c.json({ error: "Server configuration error" }, 500);
  }

  // Clone request to read raw body bytes for HMAC verification
  const rawBodyBuffer = await c.req.raw.clone().arrayBuffer();
  const rawBody = new Uint8Array(rawBodyBuffer);

  const isValid = await verifyWebhookSignature(rawBody, signatureHeader, appSecret);

  if (!isValid) {
    logger.warn(
      {
        hasSignature: !!signatureHeader,
        signatureHeaderPrefix: signatureHeader ? signatureHeader.slice(0, 15) : "none",
        bodyBytes: rawBody.length,
      },
      "Rejecting webhook request with invalid signature"
    );
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing webhook signature",
        },
      },
      401
    );
  }

  // Parse JSON payload
  let payload: unknown;
  try {
    const text = new TextDecoder().decode(rawBody);
    payload = JSON.parse(text);
  } catch (err) {
    logger.error({ err }, "Malformed JSON body in webhook payload");
    return c.json({ error: "Malformed JSON payload" }, 400);
  }

  // Immediately respond 200 OK to Meta
  const response = c.json({ received: true }, 200);

  // Normalize and extract only eligible comment events
  const ownUserId = c.env.IG_BUSINESS_ACCOUNT_ID || c.env.IG_USER_ID;
  const commentEvents = normalizeWebhookPayload(payload, ownUserId);

  if (commentEvents.length > 0) {
    const processingPromise = processCommentEvents(commentEvents, c.env).catch(
      (err) => {
        logger.error({ err }, "Error processing comment events in background");
      }
    );

    // Hand off to Cloudflare Workers waitUntil to keep isolate alive without blocking HTTP response
    try {
      c.executionCtx.waitUntil(processingPromise);
    } catch {
      // In local unit test environments without ExecutionContext, wait for resolution
      await processingPromise;
    }
  }

  return response;
});

export default webhookRouter;
