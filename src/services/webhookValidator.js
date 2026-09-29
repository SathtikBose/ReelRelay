const crypto = require("crypto");
const { env } = require("../config/env");

/**
 * Computes HMAC-SHA256 hex digest for a raw body buffer or string
 * @param {Buffer | string} rawBody
 * @param {string} [appSecret=env.IG_APP_SECRET]
 * @returns {string} Hex string
 */
function computeSignature(rawBody, appSecret = env.IG_APP_SECRET) {
  const hmac = crypto.createHmac("sha256", appSecret);
  hmac.update(rawBody);
  return hmac.digest("hex");
}

/**
 * Validates Meta X-Hub-Signature-256 header using timing-safe comparison
 * @param {Buffer | string} rawBody
 * @param {string | undefined} signatureHeader Header value e.g. "sha256=abcdef..."
 * @param {string} [appSecret=env.IG_APP_SECRET]
 * @returns {boolean} True if signature is valid
 */
function verifySignature(rawBody, signatureHeader, appSecret = env.IG_APP_SECRET) {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }

  if (!rawBody) {
    return false;
  }

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    return false;
  }

  const receivedHex = parts[1];
  const expectedHex = computeSignature(rawBody, appSecret);

  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  const receivedBuffer = Buffer.from(receivedHex, "hex");
  const expectedBuffer = Buffer.from(expectedHex, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

/**
 * Timing-safe comparison of verification token during webhook handshake
 * @param {string | undefined} incomingToken
 * @param {string} [expectedToken=env.IG_VERIFY_TOKEN]
 * @returns {boolean}
 */
function verifyHandshakeToken(incomingToken, expectedToken = env.IG_VERIFY_TOKEN) {
  if (!incomingToken || typeof incomingToken !== "string" || !expectedToken) {
    return false;
  }

  const incomingBuffer = Buffer.from(incomingToken, "utf8");
  const expectedBuffer = Buffer.from(expectedToken, "utf8");

  if (incomingBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(incomingBuffer, expectedBuffer);
}

module.exports = {
  computeSignature,
  verifySignature,
  verifyHandshakeToken,
};
