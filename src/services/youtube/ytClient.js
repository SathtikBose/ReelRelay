const { YouTubeApiError, NotFoundError } = require("../../lib/errors");
const { logger } = require("../../lib/logger");

const YT_BASE_URL = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 10000;

/**
 * Performs an authenticated fetch call to the YouTube Data API v3 with timeout and error handling
 * @param {string} endpoint - API path (e.g. '/channels?part=snippet&mine=true')
 * @param {string} accessToken - Valid short-lived access token
 * @param {RequestInit} [options={}] - Fetch options
 * @returns {Promise<any>}
 */
async function callYtApi(endpoint, accessToken, options = {}) {
  const url = `${YT_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorObj = data.error || {};
      const firstError = errorObj.errors?.[0] || {};
      const reason = firstError.reason || errorObj.message || "unknown_error";
      const message = errorObj.message || `YouTube API error (${res.status})`;

      let errorType = "transient";
      if (res.status === 401 || reason === "invalid_grant") {
        errorType = "auth";
      } else if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        errorType = "quota";
      } else if (res.status === 403 || res.status === 400 || res.status === 404) {
        errorType = "permanent";
      }

      logger.warn({ status: res.status, reason, endpoint }, "YouTube API call failed");
      throw new YouTubeApiError(message, res.status, reason, errorType);
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new YouTubeApiError("YouTube API request timed out (10s)", 504, "timeout", "transient");
    }
    if (err instanceof YouTubeApiError || err instanceof NotFoundError) {
      throw err;
    }
    throw new YouTubeApiError(err.message || "Network error communicating with YouTube", 502, "network_error", "transient");
  }
}

/**
 * Identifies the connected channel and gets its uploads playlist ID
 * @param {string} accessToken
 * @returns {Promise<{ channelId: string, channelTitle: string, uploadsPlaylistId: string }>}
 */
async function getMyChannel(accessToken) {
  const data = await callYtApi("/channels?part=snippet,contentDetails&mine=true", accessToken);

  if (!data.items || data.items.length === 0) {
    throw new NotFoundError("No YouTube channel found for the authenticated Google account. Please create a YouTube channel first.");
  }

  const item = data.items[0];
  const channelId = item.id;
  const channelTitle = item.snippet?.title || "";
  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || "";

  return {
    channelId,
    channelTitle,
    uploadsPlaylistId,
  };
}

module.exports = {
  callYtApi,
  getMyChannel,
};
