const { env } = require("../config/env");
const tokenService = require("./tokenService");
const { InstagramApiError, AppError } = require("../lib/errors");
const { logger } = require("../lib/logger");

const GRAPH_BASE_URL = "https://graph.instagram.com";
const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds timeout per spec

/**
 * Builds the versioned Graph API base URL
 * @returns {string}
 */
function getApiBaseUrl() {
  const version = env.IG_API_VERSION ? `/${env.IG_API_VERSION.replace(/^\//, "")}` : "";
  return `${GRAPH_BASE_URL}${version}`;
}

/**
 * Classifies Meta/Instagram API errors into transient, permanent, or auth
 * @param {number} httpStatus
 * @param {number | string | undefined} igCode
 * @param {number | string | undefined} igSubcode
 * @param {string} message
 * @returns {"transient" | "permanent" | "auth"}
 */
function classifyError(httpStatus, igCode, igSubcode, message = "") {
  const codeNum = Number(igCode);
  const subcodeNum = Number(igSubcode);

  // Auth failure: Code 190 (Invalid / Expired OAuth token)
  if (codeNum === 190 || subcodeNum === 463 || subcodeNum === 467) {
    return "auth";
  }

  // Rate limits / transient server errors
  // Code 4: Application request limit reached
  // Code 17: User request limit reached
  // Code 32: Page request limit reached
  // Code 613: Custom-level throttling
  if ([4, 17, 32, 613].includes(codeNum) || httpStatus === 429 || httpStatus >= 500) {
    return "transient";
  }

  // Network / timeout message detection
  if (message.includes("ETIMEDOUT") || message.includes("ECONNRESET") || message.includes("timeout")) {
    return "transient";
  }

  // Everything else (e.g. comment older than 7 days, invalid permissions, bad request) is permanent
  return "permanent";
}

/**
 * Executes an HTTP request to Instagram Graph API with AbortController timeout
 * @param {string} endpoint
 * @param {RequestInit} [options={}]
 * @param {string} [tokenOverride]
 * @returns {Promise<any>}
 */
async function callInstagramApi(endpoint, options = {}, tokenOverride = null) {
  const token = tokenOverride || (await tokenService.getDecryptedToken());
  const url = endpoint.startsWith("http") ? endpoint : `${getApiBaseUrl()}${endpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errObj = (typeof data === "object" && data && data.error) ? data.error : {};
      const igCode = errObj.code;
      const igSubcode = errObj.error_subcode;
      const rawMessage = errObj.message || `Instagram API returned status ${response.status}`;
      // Sanitize tokens out of any error messages
      const sanitizedMessage = rawMessage.replace(/EAA[a-zA-Z0-9_-]+/g, "[REDACTED_TOKEN]");

      const errorType = classifyError(response.status, igCode, igSubcode, sanitizedMessage);

      throw new InstagramApiError(
        sanitizedMessage,
        response.status,
        igCode,
        igSubcode,
        errorType
      );
    }

    return data;
  } catch (err) {
    if (err instanceof InstagramApiError) {
      throw err;
    }

    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      throw new InstagramApiError(
        "Instagram API request timed out after 10 seconds",
        504,
        "TIMEOUT",
        undefined,
        "transient"
      );
    }

    if (err instanceof AppError) {
      throw err;
    }

    // Network level error
    throw new InstagramApiError(
      `Network error communicating with Instagram: ${err.message}`,
      503,
      "NETWORK_ERROR",
      undefined,
      "transient"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Sends a private reply message to an Instagram commenter
 * @param {string} commentId
 * @param {string} messageText
 * @param {string} [igUserId=env.IG_USER_ID]
 * @returns {Promise<{ recipient_id: string, message_id: string }>}
 */
async function sendPrivateReply(commentId, messageText, igUserId = env.IG_USER_ID) {
  if (!commentId) {
    throw new AppError("commentId is required to send private reply", 400);
  }
  if (!messageText) {
    throw new AppError("messageText is required to send private reply", 400);
  }

  const endpoint = `/${igUserId}/messages`;
  const body = {
    recipient: { comment_id: commentId },
    message: { text: messageText },
  };

  logger.info({ commentId, igUserId }, "Sending Instagram private reply DM");

  return callInstagramApi(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Fetches recent media items (reels) for the reel picker
 * @param {number} [limit=25]
 * @param {string | null} [afterCursor=null]
 * @returns {Promise<{ data: Array<any>, paging?: { cursors?: { after?: string } } }>}
 */
async function listRecentMedia(limit = 25, afterCursor = null) {
  const fields = "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp";
  let endpoint = `/me/media?fields=${fields}&limit=${limit}`;
  if (afterCursor) {
    endpoint += `&after=${encodeURIComponent(afterCursor)}`;
  }

  return callInstagramApi(endpoint, { method: "GET" });
}

/**
 * Refreshes a long-lived Instagram user access token
 * @param {string} currentToken
 * @returns {Promise<{ access_token: string, token_type: string, expires_in: number }>}
 */
async function refreshToken(currentToken) {
  const endpoint = `${GRAPH_BASE_URL}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
    currentToken
  )}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    const data = await res.json();

    if (!res.ok || data.error) {
      const errObj = data.error || {};
      throw new InstagramApiError(
        errObj.message || "Failed to refresh Instagram access token",
        res.status,
        errObj.code,
        errObj.error_subcode,
        classifyError(res.status, errObj.code, errObj.error_subcode, errObj.message)
      );
    }

    return data;
  } catch (err) {
    if (err instanceof InstagramApiError) throw err;
    throw new InstagramApiError(
      `Network error refreshing token: ${err.message}`,
      503,
      "REFRESH_NETWORK_ERROR",
      undefined,
      "transient"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Subscribes the Instagram Creator account to webhook fields (comments, messages)
 * @returns {Promise<{ success: boolean }>}
 */
async function subscribeAppWebhooks() {
  const fields = "comments,messages";
  const endpoint = `/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`;
  return callInstagramApi(endpoint, { method: "POST" });
}

module.exports = {
  sendPrivateReply,
  listRecentMedia,
  refreshToken,
  subscribeAppWebhooks,
  callInstagramApi,
  classifyError,
  getApiBaseUrl,
};
