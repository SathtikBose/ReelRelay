const { YtCredential } = require("../../models/YtCredential");
const { encrypt, decrypt } = require("../../lib/crypto");
const oauth = require("./oauth");
const { env } = require("../../config/env");
const { logger } = require("../../lib/logger");
const { UnauthorizedError } = require("../../lib/errors");

// In-memory access token cache
let memoryTokenCache = {
  accessToken: null,
  expiresAt: 0,
};

/**
 * Saves or updates YouTube credentials in the database with encrypted refresh token
 * @param {object} params
 * @param {string} params.channelId
 * @param {string} params.channelTitle
 * @param {string} params.uploadsPlaylistId
 * @param {string} params.refreshToken
 * @param {string[]} [params.scopes]
 * @returns {Promise<YtCredential>}
 */
async function saveCredential({ channelId, channelTitle, uploadsPlaylistId, refreshToken, scopes = [] }) {
  const { tokenCipher, tokenIv, tokenTag } = encrypt(refreshToken);

  const cred = await YtCredential.findOneAndUpdate(
    { key: "youtube" },
    {
      $set: {
        channelId,
        channelTitle,
        uploadsPlaylistId,
        refreshCipher: tokenCipher,
        refreshIv: tokenIv,
        refreshTag: tokenTag,
        scopes,
        status: "connected",
        connectedAt: new Date(),
        lastRefreshedAt: new Date(),
        lastError: "",
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  // Invalidate memory cache so next call fetches fresh token
  memoryTokenCache = { accessToken: null, expiresAt: 0 };
  logger.info({ channelId, channelTitle }, "Saved encrypted YouTube credentials");
  return cred;
}

/**
 * Retrieves the raw credential document
 * @returns {Promise<YtCredential|null>}
 */
async function getCredential() {
  return YtCredential.findOne({ key: "youtube" }).lean();
}

/**
 * Decrypts the stored refresh token
 * @returns {Promise<string|null>} Plaintext refresh token
 */
async function getDecryptedRefreshToken() {
  const cred = await getCredential();
  if (!cred || !cred.refreshCipher || !cred.refreshIv || !cred.refreshTag) {
    return null;
  }

  try {
    return decrypt({
      tokenCipher: cred.refreshCipher,
      tokenIv: cred.refreshIv,
      tokenTag: cred.refreshTag,
    });
  } catch (err) {
    logger.error({ err }, "Failed to decrypt YouTube refresh token");
    return null;
  }
}

/**
 * Retrieves a valid short-lived access token, refreshing if necessary
 * @returns {Promise<string>} Valid access token
 */
async function getAccessToken() {
  // Check in-memory cache (with 60-second safety buffer)
  if (memoryTokenCache.accessToken && memoryTokenCache.expiresAt > Date.now() + 60000) {
    return memoryTokenCache.accessToken;
  }

  const refreshToken = await getDecryptedRefreshToken();
  if (!refreshToken) {
    throw new UnauthorizedError("No YouTube refresh token available. Please connect your YouTube channel.");
  }

  try {
    const res = await oauth.refreshAccessToken(refreshToken);

    memoryTokenCache = {
      accessToken: res.accessToken,
      expiresAt: Date.now() + res.expiresIn * 1000,
    };

    await YtCredential.updateOne(
      { key: "youtube" },
      {
        $set: {
          lastRefreshedAt: new Date(),
          status: "connected",
          lastError: "",
        },
      }
    );

    return res.accessToken;
  } catch (err) {
    if (err.ytReason === "invalid_grant" || err.statusCode === 400 || err.statusCode === 401) {
      await markNeedsReauth(err.message);
    }
    throw err;
  }
}

/**
 * Marks credentials as needing re-authentication
 * @param {string} errorMessage
 */
async function markNeedsReauth(errorMessage) {
  memoryTokenCache = { accessToken: null, expiresAt: 0 };
  await YtCredential.updateOne(
    { key: "youtube" },
    {
      $set: {
        status: "needs_reauth",
        lastError: errorMessage.slice(0, 500),
      },
    }
  );
  logger.warn({ errorMessage }, "Marked YouTube credentials as needs_reauth");
}

/**
 * Disconnects the YouTube channel, revoking tokens and clearing credentials
 */
async function disconnect() {
  const refreshToken = await getDecryptedRefreshToken();
  if (refreshToken) {
    await oauth.revokeToken(refreshToken);
  }

  if (memoryTokenCache.accessToken) {
    await oauth.revokeToken(memoryTokenCache.accessToken);
  }

  memoryTokenCache = { accessToken: null, expiresAt: 0 };

  await YtCredential.deleteOne({ key: "youtube" });
  logger.info("YouTube channel disconnected and credentials cleared");
}

/**
 * Returns overall YouTube connection status for views and dashboards
 * @returns {Promise<object>}
 */
async function getStatus() {
  const cred = await getCredential();
  const configured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const isConnected = !!(cred && cred.status === "connected");

  return {
    configured,
    enabled: env.YT_ENABLED,
    connected: isConnected,
    status: cred ? cred.status : "disconnected",
    channelId: cred?.channelId || "",
    channelTitle: cred?.channelTitle || "",
    uploadsPlaylistId: cred?.uploadsPlaylistId || "",
    connectedAt: cred?.connectedAt || null,
    lastRefreshedAt: cred?.lastRefreshedAt || null,
    lastError: cred?.lastError || "",
  };
}

module.exports = {
  saveCredential,
  getCredential,
  getDecryptedRefreshToken,
  getAccessToken,
  markNeedsReauth,
  disconnect,
  getStatus,
};
