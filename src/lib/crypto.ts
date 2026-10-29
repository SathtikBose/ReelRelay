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
 * Computes HMAC hex digest using standard Web Crypto API (SHA-256 or SHA-1).
 */
export async function computeHmacHex(
  algorithm: "SHA-256" | "SHA-1",
  secret: string,
  data: Uint8Array
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes HMAC-SHA256 hex digest using standard Web Crypto API.
 */
export async function computeHmacSha256Hex(secret: string, data: Uint8Array): Promise<string> {
  return computeHmacHex("SHA-256", secret, data);
}

/**
 * Computes HMAC-SHA1 hex digest using standard Web Crypto API.
 */
export async function computeHmacSha1Hex(secret: string, data: Uint8Array): Promise<string> {
  return computeHmacHex("SHA-1", secret, data);
}

/**
 * Verifies the X-Hub-Signature-256 or X-Hub-Signature header against the raw request body bytes.
 * Resilient to both SHA-256 and legacy SHA-1 signatures, and handles potential quoted secrets.
 */
export async function verifyWebhookSignature(
  rawBody: Uint8Array,
  signatureHeader: string | undefined | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret || !rawBody || rawBody.length === 0) {
    return false;
  }

  // Header must be formatted as "<algo>=<hex>"
  const parts = signatureHeader.split("=");
  if (parts.length !== 2) {
    return false;
  }

  const [algo, receivedHex] = parts;
  const normalizedAlgo = algo.toLowerCase();
  const hashAlgo: "SHA-256" | "SHA-1" | null =
    normalizedAlgo === "sha256" ? "SHA-256" : normalizedAlgo === "sha1" ? "SHA-1" : null;

  if (!hashAlgo) {
    return false;
  }

  // Check candidates (unquoted/trimmed vs raw)
  const cleanSecret = secret.trim().replace(/^["']|["']$/g, "").trim();
  const candidates = [cleanSecret, secret.trim(), secret];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const expectedHex = await computeHmacHex(hashAlgo, candidate, rawBody);
      if (constantTimeEqual(receivedHex.toLowerCase(), expectedHex.toLowerCase())) {
        return true;
      }
    } catch {
      // Continue to next candidate
    }
  }

  return false;
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
