/**
 * Constant-time comparison between two strings to prevent timing attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Computes HMAC-SHA256 hex digest using standard Web Crypto API.
 */
export async function computeHmacSha256Hex(secret: string, data: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body bytes.
 */
export async function verifyWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | undefined | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret || !rawBody || rawBody.length === 0) {
    return false;
  }

  // Header must be formatted as "sha256=<64-char-hex>"
  const parts = signatureHeader.split("=");
  if (parts.length !== 2) {
    return false;
  }

  const [algo, receivedHex] = parts;
  if (algo.toLowerCase() !== "sha256") {
    return false;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(receivedHex)) {
    return false;
  }

  const expectedHex = await computeHmacSha256Hex(secret, rawBody);
  return constantTimeEqual(receivedHex.toLowerCase(), expectedHex.toLowerCase());
}

/**
 * Verifies incoming verify token against expected verify token during Meta webhook handshake.
 */
export function verifyHandshakeToken(
  incomingToken: string | undefined | null,
  expectedToken: string | undefined | null
): boolean {
  if (!incomingToken || !expectedToken) {
    return false;
  }
  return constantTimeEqual(incomingToken, expectedToken);
}
