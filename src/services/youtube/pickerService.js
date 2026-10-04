const ytClient = require("./ytClient");
const credentialService = require("./credentialService");
const { YtVideoRule } = require("../../models/YtVideoRule");
const { env } = require("../../config/env");
const { logger } = require("../../lib/logger");
const { UnauthorizedError } = require("../../lib/errors");

// In-memory cache for picker results: Map<string, { data: object, expiresAt: number }>
const pickerCache = new Map();

/**
 * Clears the picker in-memory cache
 */
function clearCache() {
  pickerCache.clear();
}

/**
 * Retrieves list of uploaded videos for the video picker, cross-referencing existing rules and caching
 * @param {object} [options]
 * @param {string} [options.pageToken]
 * @param {boolean} [options.refresh=false]
 * @returns {Promise<{ items: Array<object>, nextPageToken: string|null, prevPageToken: string|null, totalResults: number, cached: boolean }>}
 */
async function getVideosList({ pageToken = "", refresh = false } = {}) {
  const cacheKey = `uploads_${pageToken || "first"}`;
  const now = Date.now();
  const cacheTtlMs = (env.YT_PICKER_CACHE_SEC || 300) * 1000;

  // Check cache if not explicitly refreshing
  if (!refresh && pickerCache.has(cacheKey)) {
    const cachedEntry = pickerCache.get(cacheKey);
    if (cachedEntry.expiresAt > now) {
      // Re-annotate hasRule with live database state in case rules changed
      const liveItems = await annotateWithRules(cachedEntry.data.items);
      return {
        ...cachedEntry.data,
        items: liveItems,
        cached: true,
      };
    }
    pickerCache.delete(cacheKey);
  }

  const credential = await credentialService.getCredential();
  if (!credential || credential.status !== "connected") {
    throw new UnauthorizedError("YouTube channel is not connected. Please connect your channel first.");
  }

  const accessToken = await credentialService.getAccessToken();

  let uploadsPlaylistId = credential.uploadsPlaylistId;
  if (!uploadsPlaylistId) {
    const channel = await ytClient.getMyChannel(accessToken);
    uploadsPlaylistId = channel.uploadsPlaylistId;
  }

  if (!uploadsPlaylistId) {
    throw new UnauthorizedError("Unable to locate uploads playlist for the connected channel.");
  }

  // Fetch uploads playlist items
  const uploadsData = await ytClient.listUploads(accessToken, uploadsPlaylistId, {
    maxResults: 25,
    pageToken: pageToken || undefined,
  });

  // Fetch duration and isShort flags for the video IDs
  const videoIds = uploadsData.items.map((i) => i.videoId).filter(Boolean);
  let videoDetailsMap = new Map();
  if (videoIds.length > 0) {
    try {
      const videoDetails = await ytClient.getVideos(accessToken, videoIds);
      for (const vid of videoDetails) {
        videoDetailsMap.set(vid.videoId, vid);
      }
    } catch (err) {
      logger.warn({ err }, "Non-fatal error fetching video duration details for picker");
    }
  }

  // Merge video duration / isShort into items
  const enrichedItems = uploadsData.items.map((item) => {
    const details = videoDetailsMap.get(item.videoId);
    return {
      ...item,
      durationSec: details?.durationSec || 0,
      isShort: details?.isShort || false,
    };
  });

  // Cross-reference with existing YtVideoRule in DB
  const annotatedItems = await annotateWithRules(enrichedItems);

  const resultData = {
    items: annotatedItems,
    nextPageToken: uploadsData.nextPageToken,
    prevPageToken: uploadsData.prevPageToken,
    totalResults: uploadsData.totalResults,
  };

  // Store in cache
  pickerCache.set(cacheKey, {
    data: {
      ...resultData,
      items: enrichedItems, // Store base items in cache without static rule annotations
    },
    expiresAt: now + cacheTtlMs,
  });

  return {
    ...resultData,
    cached: false,
  };
}

/**
 * Annotates video items with existing rules in MongoDB
 * @param {Array<object>} items
 * @returns {Promise<Array<object>>}
 */
async function annotateWithRules(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const videoIds = items.map((i) => i.videoId).filter(Boolean);
  const existingRules = await YtVideoRule.find({ videoId: { $in: videoIds } }).lean();
  const ruleMap = new Map();
  for (const rule of existingRules) {
    ruleMap.set(rule.videoId, rule);
  }

  return items.map((item) => {
    const rule = ruleMap.get(item.videoId);
    return {
      ...item,
      hasRule: !!rule,
      ruleId: rule ? rule._id.toString() : null,
      active: rule ? rule.active : false,
    };
  });
}

module.exports = {
  getVideosList,
  clearCache,
  annotateWithRules,
};
