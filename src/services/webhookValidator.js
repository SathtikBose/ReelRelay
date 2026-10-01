const crypto = require("crypto");
const { env } = require("../config/env");

/**
 * Computes HMAC hex digest for a raw body buffer or string
 * @param {Buffer | string} rawBody
 * @param {string} [appSecret=env.IG_APP_SECRET]
 * @param {string} [algo="sha256"]
 * @returns {string} Hex string
 */
function computeSignature(rawBody, appSecret = env.IG_APP_SECRET, algo = "sha256") {
  const hmac = crypto.createHmac(algo, appSecret);
  hmac.update(rawBody);
  return hmac.digest("hex");
}

/**
 * Validates Meta X-Hub-Signature-256 or X-Hub-Signature header using timing-safe comparison
 * @param {Buffer | string} rawBody
 * @param {string | undefined} signatureHeader Header value e.g. "sha256=abcdef..." or "sha1=abcdef..."
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
  if (parts.length !== 2) {
    return false;
  }

  const algo = parts[0].toLowerCase();
  if (algo !== "sha256" && algo !== "sha1") {
    return false;
  }

  const receivedHex = parts[1];
  const candidateSecrets = [
    appSecret,
    env.IG_APP_SECRET,
    env.IG_INSTAGRAM_APP_SECRET,
  ].filter(Boolean);

  const uniqueSecrets = [...new Set(candidateSecrets)];

  for (const secret of uniqueSecrets) {
    const expectedHex = computeSignature(rawBody, secret, algo);
    if (receivedHex.length === expectedHex.length) {
      const receivedBuffer = Buffer.from(receivedHex, "hex");
      const expectedBuffer = Buffer.from(expectedHex, "hex");
      if (
        receivedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
      ) {
        return true;
      }
    }
  }

  return false;
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
