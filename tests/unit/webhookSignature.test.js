const {
  computeSignature,
  verifySignature,
  verifyHandshakeToken,
} = require("../../src/services/webhookValidator");

describe("Webhook Signature & Handshake Validator", () => {
  const secret = "test_app_secret_12345";
  const rawBody = Buffer.from(JSON.stringify({ object: "instagram", entry: [] }));

  describe("verifySignature()", () => {
    it("returns true for a valid signature", () => {
      const hex = computeSignature(rawBody, secret);
      const header = `sha256=${hex}`;

      expect(verifySignature(rawBody, header, secret)).toBe(true);
    });

    it("returns false for an invalid signature", () => {
      const header = "sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      expect(verifySignature(rawBody, header, secret)).toBe(false);
    });

    it("returns false when signature header is missing or not a string", () => {
      expect(verifySignature(rawBody, undefined, secret)).toBe(false);
      expect(verifySignature(rawBody, null, secret)).toBe(false);
      expect(verifySignature(rawBody, "", secret)).toBe(false);
    });

    it("returns false when header does not start with sha256=", () => {
      const hex = computeSignature(rawBody, secret);
      expect(verifySignature(rawBody, `md5=${hex}`, secret)).toBe(false);
      expect(verifySignature(rawBody, hex, secret)).toBe(false);
    });

    it("returns false when payload body was tampered with", () => {
      const hex = computeSignature(rawBody, secret);
      const header = `sha256=${hex}`;
      const tamperedBody = Buffer.from(JSON.stringify({ object: "instagram", entry: ["tampered"] }));

      expect(verifySignature(tamperedBody, header, secret)).toBe(false);
    });
  });

  describe("verifyHandshakeToken()", () => {
    const validToken = "my_super_secure_verify_token_456";

    it("returns true when tokens match", () => {
      expect(verifyHandshakeToken(validToken, validToken)).toBe(true);
    });

    it("returns false when tokens differ", () => {
      expect(verifyHandshakeToken("wrong_token", validToken)).toBe(false);
    });

    it("returns false for undefined or empty token", () => {
      expect(verifyHandshakeToken(undefined, validToken)).toBe(false);
      expect(verifyHandshakeToken("", validToken)).toBe(false);
    });
  });
});
