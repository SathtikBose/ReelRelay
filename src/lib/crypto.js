const crypto = require("crypto");
const { env } = require("../config/env");
const { AppError } = require("./errors");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes recommended for GCM

/**
 * Derives encryption key buffer from hex environment variable
 * @returns {Buffer}
 */
function getKeyBuffer() {
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length !== 64) {
    throw new AppError("Invalid or missing ENCRYPTION_KEY (must be 64 hex characters)", 500);
  }
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM
 * @param {string} plainText
 * @returns {{ tokenCipher: string, tokenIv: string, tokenTag: string }} Base64 encoded payload
 */
function encrypt(plainText) {
  if (typeof plainText !== "string" || plainText.length === 0) {
    throw new AppError("Cannot encrypt empty or non-string payload", 400);
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    tokenCipher: encrypted.toString("base64"),
    tokenIv: iv.toString("base64"),
    tokenTag: tag.toString("base64"),
  };
}

/**
 * Decrypts AES-256-GCM payload
 * @param {{ tokenCipher: string, tokenIv: string, tokenTag: string }} payload
 * @returns {string} Decrypted plaintext
 */
function decrypt({ tokenCipher, tokenIv, tokenTag }) {
  if (!tokenCipher || !tokenIv || !tokenTag) {
    throw new AppError("Invalid encrypted payload: missing cipher, iv, or tag", 400);
  }

  const key = getKeyBuffer();
  const iv = Buffer.from(tokenIv, "base64");
  const tag = Buffer.from(tokenTag, "base64");
  const encrypted = Buffer.from(tokenCipher, "base64");

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    throw new AppError("Decryption failed: payload has been tampered with or corrupted", 400, "DECRYPTION_ERROR");
  }
}

module.exports = {
  encrypt,
  decrypt,
  getKeyBuffer,
};
