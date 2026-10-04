const { YouTubeApiError, NotFoundError } = require("../../lib/errors");
const { logger } = require("../../lib/logger");

const YT_BASE_URL = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 10000;

/**
 * Parses an ISO 8601 duration string (e.g. 'PT1M30S', 'PT45S', 'PT1H2M') into seconds
 * @param {string} [duration]
 * @returns {number} Duration in seconds
 */
function parseIsoDuration(duration) {
  if (!duration || typeof duration !== "string" || !duration.startsWith("PT")) {
    return 0;
  }

  const str = duration.slice(2);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const hIdx = str.indexOf("H");
  const mIdx = str.indexOf("M");
  const sIdx = str.indexOf("S");

  let rest = str;
  if (hIdx !== -1) {
    hours = parseInt(rest.slice(0, hIdx), 10) || 0;
    rest = rest.slice(hIdx + 1);
  }
  if (mIdx !== -1) {
    const nextM = rest.indexOf("M");
    minutes = parseInt(rest.slice(0, nextM), 10) || 0;
    rest = rest.slice(nextM + 1);
  }
  if (sIdx !== -1) {
    const nextS = rest.indexOf("S");
    seconds = parseInt(rest.slice(0, nextS), 10) || 0;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

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
      } else if (
        res.status === 403 ||
        res.status === 400 ||
        res.status === 404 ||
        reason === "commentsDisabled"
      ) {
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
    throw new YouTubeApiError(
      err.message || "Network error communicating with YouTube",
      502,
      "network_error",
      "transient"
    );
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
    throw new NotFoundError(
      "No YouTube channel found for the authenticated Google account. Please create a YouTube channel first."
    );
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

/**
 * Lists uploaded videos from the channel's uploads playlist
 * @param {string} accessToken
 * @param {string} uploadsPlaylistId
 * @param {object} [options]
 * @param {number} [options.maxResults=25]
 * @param {string} [options.pageToken]
 * @returns {Promise<{ items: Array<object>, nextPageToken: string|null, prevPageToken: string|null, totalResults: number }>}
 */
async function listUploads(accessToken, uploadsPlaylistId, { maxResults = 25, pageToken } = {}) {
  let endpoint = `/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(
    uploadsPlaylistId
  )}&maxResults=${Math.min(50, Math.max(1, maxResults))}`;

  if (pageToken) {
    endpoint += `&pageToken=${encodeURIComponent(pageToken)}`;
  }

  const data = await callYtApi(endpoint, accessToken);

  const items = (data.items || []).map((item) => {
    const snippet = item.snippet || {};
    const contentDetails = item.contentDetails || {};
    const videoId = contentDetails.videoId || snippet.resourceId?.videoId || "";

    const thumbnails = snippet.thumbnails || {};
    const thumbnailUrl =
      thumbnails.medium?.url ||
      thumbnails.high?.url ||
      thumbnails.standard?.url ||
      thumbnails.default?.url ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

    return {
      videoId,
      title: snippet.title || "Untitled Video",
      description: snippet.description || "",
      thumbnailUrl,
      publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : new Date(),
    };
  });

  return {
    items,
    nextPageToken: data.nextPageToken || null,
    prevPageToken: data.prevPageToken || null,
    totalResults: data.pageInfo?.totalResults || items.length,
  };
}

/**
 * Retrieves full details and durations for a list of video IDs
 * @param {string} accessToken
 * @param {string[]} videoIds - Array of 11-char video IDs
 * @returns {Promise<Array<{ videoId: string, title: string, thumbnailUrl: string, publishedAt: Date, durationSec: number, isShort: boolean }>>}
 */
async function getVideos(accessToken, videoIds = []) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return [];
  }

  const cleanIds = videoIds.filter((id) => typeof id === "string" && id.trim().length === 11);
  if (cleanIds.length === 0) {
    return [];
  }

  const endpoint = `/videos?part=snippet,contentDetails&id=${cleanIds.map(encodeURIComponent).join(",")}`;
  const data = await callYtApi(endpoint, accessToken);

  return (data.items || []).map((item) => {
    const snippet = item.snippet || {};
    const contentDetails = item.contentDetails || {};
    const durationSec = parseIsoDuration(contentDetails.duration);
    // YouTube Shorts duration heuristic: <= 180 seconds (3 minutes)
    const isShort = durationSec > 0 && durationSec <= 180;

    const thumbnails = snippet.thumbnails || {};
    const thumbnailUrl =
      thumbnails.medium?.url ||
      thumbnails.high?.url ||
      thumbnails.standard?.url ||
      thumbnails.default?.url ||
      `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;

    return {
      videoId: item.id,
      title: snippet.title || "Untitled Video",
      description: snippet.description || "",
      thumbnailUrl,
      publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : new Date(),
      durationSec,
      isShort,
    };
  });
}

/**
 * Retrieves top-level comment threads for a video ordered by time (newest first)
 * @param {string} accessToken
 * @param {string} videoId
 * @param {object} [options]
 * @param {number} [options.maxResults=50]
 * @param {string} [options.pageToken]
 * @returns {Promise<{ items: Array<object>, nextPageToken: string|null, totalResults: number }>}
 */
async function listCommentThreads(accessToken, videoId, { maxResults = 50, pageToken } = {}) {
  let endpoint = `/commentThreads?part=snippet&videoId=${encodeURIComponent(
    videoId
  )}&order=time&textFormat=plainText&maxResults=${Math.min(100, Math.max(1, maxResults))}`;

  if (pageToken) {
    endpoint += `&pageToken=${encodeURIComponent(pageToken)}`;
  }

  const data = await callYtApi(endpoint, accessToken);

  return {
    items: data.items || [],
    nextPageToken: data.nextPageToken || null,
    totalResults: data.pageInfo?.totalResults || (data.items || []).length,
  };
}

/**
 * Posts a top-level reply to a viewer comment
 * @param {string} accessToken
 * @param {string} parentId - The top-level comment thread ID to reply to
 * @param {string} textOriginal - The plaintext reply message
 * @returns {Promise<{ id: string, textOriginal: string, publishedAt: string }>}
 */
async function insertReply(accessToken, parentId, textOriginal) {
  const data = await callYtApi("/comments?part=snippet", accessToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        parentId,
        textOriginal,
      },
    }),
  });

  return {
    id: data.id,
    textOriginal: data.snippet?.textOriginal || textOriginal,
    publishedAt: data.snippet?.publishedAt || new Date().toISOString(),
  };
}

module.exports = {
  callYtApi,
  getMyChannel,
  listUploads,
  getVideos,
  listCommentThreads,
  insertReply,
  parseIsoDuration,
};
