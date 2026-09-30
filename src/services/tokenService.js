const { Credential } = require("../models/Credential");
const { encrypt, decrypt } = require("../lib/crypto");
const { env } = require("../config/env");
const { logger } = require("../lib/logger");
const { AppError } = require("../lib/errors");

/**
 * Bootstraps the encrypted Instagram access token into MongoDB if none exists
 * @returns {Promise<boolean>} True if bootstrapped, false if already exists or skipped
 */
async function bootstrapToken() {
  const existing = await Credential.findOne({ key: "instagram" });
  if (existing) {
    logger.debug("Instagram credential already present in database");
    return false;
  }

  if (!env.IG_ACCESS_TOKEN) {
    logger.warn("No IG_ACCESS_TOKEN in env to bootstrap initial credentials");
    return false;
  }

  const { tokenCipher, tokenIv, tokenTag } = encrypt(env.IG_ACCESS_TOKEN);

  await Credential.create({
    key: "instagram",
    igUserId: env.IG_USER_ID || "",
    tokenCipher,
    tokenIv,
    tokenTag,
    expiresAt: null,
    lastRefreshedAt: new Date(),
    lastRefreshStatus: "ok",
    lastRefreshError: "",
  });

  logger.info("Successfully bootstrapped initial encrypted Instagram credential");
  return true;
}

/**
 * Retrieves and decrypts the current Instagram access token
 * @returns {Promise<string>}
 */
async function getDecryptedToken() {
  const credential = await Credential.findOne({ key: "instagram" });
  if (!credential) {
    throw new AppError("Instagram access token not configured in database", 401, "TOKEN_NOT_CONFIGURED");
  }

  return decrypt({
    tokenCipher: credential.tokenCipher,
    tokenIv: credential.tokenIv,
    tokenTag: credential.tokenTag,
  });
}

/**
 * Encrypts and persists a new or refreshed access token
 * @param {string} token
 * @param {number} [expiresInSeconds]
 * @param {string} [igUserId=env.IG_USER_ID]
 * @returns {Promise<InstanceType<typeof Credential>>}
 */
async function saveToken(token, expiresInSeconds = null, igUserId = env.IG_USER_ID) {
  const { tokenCipher, tokenIv, tokenTag } = encrypt(token);

  const expiresAt =
    typeof expiresInSeconds === "number" && expiresInSeconds > 0
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

  const updated = await Credential.findOneAndUpdate(
    { key: "instagram" },
    {
      igUserId: igUserId || "",
      tokenCipher,
      tokenIv,
      tokenTag,
      expiresAt,
      lastRefreshedAt: new Date(),
      lastRefreshStatus: "ok",
      lastRefreshError: "",
    },
    { upsert: true, new: true }
  );

  logger.info("Successfully saved encrypted Instagram access token");
  return updated;
}

/**
 * Records a failure during token refresh operations
 * @param {string} errorMessage
 * @returns {Promise<void>}
 */
async function recordRefreshFailure(errorMessage) {
  await Credential.findOneAndUpdate(
    { key: "instagram" },
    {
      lastRefreshStatus: "error",
      lastRefreshError: (errorMessage || "Unknown refresh error").slice(0, 500),
      lastRefreshedAt: new Date(),
    }
  );
  logger.warn({ errorMessage }, "Recorded token refresh failure");
}

/**
 * Gets safe metadata about the stored token for dashboard / settings
 * @returns {Promise<{
 *   exists: boolean,
 *   igUserId: string,
 *   expiresAt: Date | null,
 *   daysLeft: number | null,
 *   isExpired: boolean,
 *   lastRefreshedAt: Date | null,
 *   lastRefreshStatus: string | null,
 *   lastRefreshError: string
 * }>}
 */
async function getTokenStatus() {
  const credential = await Credential.findOne({ key: "instagram" });
  if (!credential) {
    return {
      exists: false,
      igUserId: "",
      expiresAt: null,
      daysLeft: null,
      isExpired: false,
      lastRefreshedAt: null,
      lastRefreshStatus: null,
      lastRefreshError: "",
    };
  }

  let daysLeft = null;
  let isExpired = false;

  if (credential.expiresAt) {
    const diffMs = credential.expiresAt.getTime() - Date.now();
    daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    isExpired = diffMs <= 0;
  }

  return {
    exists: true,
    igUserId: credential.igUserId || "",
    expiresAt: credential.expiresAt,
    daysLeft,
    isExpired,
    lastRefreshedAt: credential.lastRefreshedAt,
    lastRefreshStatus: credential.lastRefreshStatus,
    lastRefreshError: credential.lastRefreshError || "",
  };
}

/**
 * Performs a token refresh if token exists and has < 15 days remaining (or expiresAt is null)
 * @returns {Promise<{ refreshed: boolean, error?: string }>}
 */
async function refreshIfNeeded() {
  const status = await getTokenStatus();
  if (!status.exists) {
    return { refreshed: false, reason: "No credential in database" };
  }

  // Refresh if no expiration date is recorded or if <= 15 days remain
  const shouldRefresh = status.expiresAt === null || (status.daysLeft !== null && status.daysLeft <= 15);

  if (!shouldRefresh) {
    logger.debug({ daysLeft: status.daysLeft }, "Token has sufficient validity; refresh skipped");
    return { refreshed: false, reason: "Token validity sufficient" };
  }

  try {
    const instagramClient = require("./instagramClient");
    const currentToken = await getDecryptedToken();
    const result = await instagramClient.refreshToken(currentToken);

    await saveToken(result.access_token, result.expires_in);
    logger.info("Automatically refreshed Instagram access token");
    return { refreshed: true };
  } catch (err) {
    logger.error({ err }, "Error during automated token refresh");
    await recordRefreshFailure(err.message);
    return { refreshed: false, error: err.message };
  }
}

/**
 * Manually forces a token refresh via Instagram API
 * @returns {Promise<{ access_token: string, expires_in: number }>}
 */
async function manualRefresh() {
  const instagramClient = require("./instagramClient");
  const currentToken = await getDecryptedToken();
  const result = await instagramClient.refreshToken(currentToken);

  await saveToken(result.access_token, result.expires_in);
  logger.info("Manually refreshed Instagram access token");
  return result;
}

/**
 * Replaces stored token with a freshly provided token from the admin
 * @param {string} newToken
 * @param {number} [expiresInSeconds=5184000] // Default 60 days in seconds
 * @returns {Promise<InstanceType<typeof Credential>>}
 */
async function replaceToken(newToken, expiresInSeconds = 60 * 24 * 60 * 60) {
  if (typeof newToken !== "string" || !newToken.trim()) {
    throw new AppError("Access token is required", 400, "INVALID_TOKEN");
  }
  return saveToken(newToken.trim(), expiresInSeconds);
}

module.exports = {
  bootstrapToken,
  getDecryptedToken,
  saveToken,
  recordRefreshFailure,
  getTokenStatus,
  refreshIfNeeded,
  manualRefresh,
  replaceToken,
};
