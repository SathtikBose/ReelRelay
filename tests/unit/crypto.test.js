const { encrypt, decrypt } = require("../../src/lib/crypto");

describe("AES-256-GCM Crypto Utility", () => {
  const secretText = "EAABxxxxxxxxxxxxxxx_test_instagram_token";

  it("successfully encrypts and decrypts a secret token", () => {
    const encrypted = encrypt(secretText);

    expect(encrypted).toHaveProperty("tokenCipher");
    expect(encrypted).toHaveProperty("tokenIv");
    expect(encrypted).toHaveProperty("tokenTag");

    expect(typeof encrypted.tokenCipher).toBe("string");
    expect(typeof encrypted.tokenIv).toBe("string");
    expect(typeof encrypted.tokenTag).toBe("string");

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secretText);
  });

  it("produces unique IVs and ciphertexts for subsequent encryptions of the same plaintext", () => {
    const enc1 = encrypt(secretText);
    const enc2 = encrypt(secretText);

    expect(enc1.tokenIv).not.toBe(enc2.tokenIv);
    expect(enc1.tokenCipher).not.toBe(enc2.tokenCipher);

    expect(decrypt(enc1)).toBe(secretText);
    expect(decrypt(enc2)).toBe(secretText);
  });

  it("throws an error when ciphertext is tampered with", () => {
    const encrypted = encrypt(secretText);
    const tamperedCipher = Buffer.from(encrypted.tokenCipher, "base64");
    tamperedCipher[0] = tamperedCipher[0] ^ 0xff; // Flip bits

    const tamperedPayload = {
      ...encrypted,
      tokenCipher: tamperedCipher.toString("base64"),
    };

    expect(() => decrypt(tamperedPayload)).toThrow(/tampered with or corrupted/);
  });

  it("throws an error when authentication tag is tampered with", () => {
    const encrypted = encrypt(secretText);
    const tamperedTag = Buffer.from(encrypted.tokenTag, "base64");
    tamperedTag[0] = tamperedTag[0] ^ 0xff;

    const tamperedPayload = {
      ...encrypted,
      tokenTag: tamperedTag.toString("base64"),
    };

    expect(() => decrypt(tamperedPayload)).toThrow(/tampered with or corrupted/);
  });

  it("throws an error when encrypting invalid input", () => {
    expect(() => encrypt("")).toThrow(/Cannot encrypt empty/);
    expect(() => encrypt(null)).toThrow(/Cannot encrypt empty/);
    expect(() => encrypt(12345)).toThrow(/Cannot encrypt empty/);
  });

  it("throws an error when decrypting payload with missing fields", () => {
    expect(() => decrypt({})).toThrow(/missing cipher, iv, or tag/);
    expect(() => decrypt({ tokenCipher: "abc" })).toThrow(/missing cipher, iv, or tag/);
  });
});
