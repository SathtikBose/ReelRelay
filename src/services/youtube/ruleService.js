const mongoose = require("mongoose");
const { YtVideoRule, DEFAULT_REPLY_VARIANTS } = require("../../models/YtVideoRule");
const { parseYouTubeVideoId } = require("./urlParser");
const pickerService = require("./pickerService");
const ytClient = require("./ytClient");
const credentialService = require("./credentialService");
const { ValidationError, NotFoundError, ConflictError } = require("../../lib/errors");
const { logger } = require("../../lib/logger");

/**
 * Lists video rules with optional active filtering
 * @param {object} [filter]
 * @param {boolean} [filter.activeOnly]
 * @returns {Promise<Array<YtVideoRule>>}
 */
async function listRules({ activeOnly = false } = {}) {
  const query = {};
  if (activeOnly) {
    query.active = true;
  }
  return YtVideoRule.find(query).sort({ createdAt: -1 }).lean();
}

/**
 * Retrieves a rule by MongoDB ObjectId
 * @param {string} id
 * @returns {Promise<YtVideoRule>}
 */
async function getRuleById(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError("Invalid video rule ID format");
  }

  const rule = await YtVideoRule.findById(id);
  if (!rule) {
    throw new NotFoundError("YouTube video rule not found");
  }

  return rule;
}

/**
 * Retrieves a rule by YouTube video ID
 * @param {string} videoId
 * @returns {Promise<YtVideoRule|null>}
 */
async function getRuleByVideoId(videoId) {
  if (!videoId || typeof videoId !== "string") {
    return null;
  }
  return YtVideoRule.findOne({ videoId: videoId.trim() });
}

/**
 * Validates and normalizes keyword strings
 * @param {string|string[]} rawKeywords
 * @returns {string[]}
 */
function normalizeKeywords(rawKeywords) {
  let list = [];
  if (typeof rawKeywords === "string") {
    list = rawKeywords.split(/[,\n]/);
  } else if (Array.isArray(rawKeywords)) {
    list = rawKeywords;
  }

  const cleaned = list
    .map((k) => (typeof k === "string" ? k.trim().toLowerCase() : ""))
    .filter((k) => k.length > 0 && k.length <= 30);

  const unique = [...new Set(cleaned)];
  if (unique.length === 0 || unique.length > 10) {
    throw new ValidationError("A rule must have between 1 and 10 valid keywords (max 30 characters each).");
  }

  return unique;
}

/**
 * Validates destination link URL
 * @param {string} link
 * @returns {string}
 */
function normalizeLink(link) {
  if (!link || typeof link !== "string") {
    throw new ValidationError("A destination link is required.");
  }

  const trimmed = link.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new ValidationError("Destination link must start with HTTPS (e.g. https://example.com).");
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError("Invalid destination URL format.");
  }

  if (trimmed.length > 2000) {
    throw new ValidationError("Destination link cannot exceed 2000 characters.");
  }

  return trimmed;
}

/**
 * Normalizes and validates reply variants
 * @param {string|string[]} rawVariants
 * @returns {string[]}
 */
function normalizeReplyVariants(rawVariants) {
  if (!rawVariants) {
    return DEFAULT_REPLY_VARIANTS;
  }

  let list = [];
  if (typeof rawVariants === "string") {
    list = rawVariants.split("\n");
  } else if (Array.isArray(rawVariants)) {
    list = rawVariants;
  }

  const cleaned = list
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);

  if (cleaned.length === 0) {
    return DEFAULT_REPLY_VARIANTS;
  }

  if (cleaned.length > 5) {
    throw new ValidationError("A rule cannot have more than 5 reply variants.");
  }

  for (const variant of cleaned) {
    if (variant.length > 500) {
      throw new ValidationError("Each reply variant cannot exceed 500 characters.");
    }
  }

  return cleaned;
}

/**
 * Creates a new YouTube video rule
 * @param {object} data
 * @returns {Promise<YtVideoRule>}
 */
async function createRule(data = {}) {
  const videoId = parseYouTubeVideoId(data.videoId || data.videoUrl || data.url);
  if (!videoId) {
    throw new ValidationError("Invalid YouTube video URL or ID. Please provide a valid 11-character video ID or URL.");
  }

  const existing = await YtVideoRule.findOne({ videoId });
  if (existing) {
    throw new ConflictError(`A rule for YouTube video "${videoId}" already exists.`);
  }

  const keywords = normalizeKeywords(data.keywords);
  const link = normalizeLink(data.link);
  const replyVariants = normalizeReplyVariants(data.replyVariants);
  const matchMode = ["word", "exact", "contains"].includes(data.matchMode) ? data.matchMode : "word";
  const backfill = data.backfill === true || data.backfill === "true" || data.backfill === "on";
  const active = data.active !== false && data.active !== "false" && data.active !== "0";

  let title = data.title ? String(data.title).trim() : "";
  let thumbnailUrl = data.thumbnailUrl ? String(data.thumbnailUrl).trim() : "";
  let publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date();
  let isShort = !!data.isShort;

  // If metadata is missing, attempt to fetch from YouTube API if connected
  if (!title || !thumbnailUrl) {
    try {
      const accessToken = await credentialService.getAccessToken();
      const [video] = await ytClient.getVideos(accessToken, [videoId]);
      if (video) {
        title = title || video.title;
        thumbnailUrl = thumbnailUrl || video.thumbnailUrl;
        publishedAt = video.publishedAt || publishedAt;
        isShort = video.isShort;
      }
    } catch {
      // Non-fatal fallback
    }
  }

  // Fallback defaults if still empty
  title = title || `YouTube Video (${videoId})`;
  thumbnailUrl = thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  // Cursor logic:
  // If backfill = true: set lastSeenAt to 7 days ago
  // If backfill = false: set lastSeenAt to now, so old comments are not processed
  const lastSeenAt = backfill ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : new Date();

  const rule = await YtVideoRule.create({
    videoId,
    title,
    thumbnailUrl,
    publishedAt,
    isShort,
    keywords,
    matchMode,
    link,
    replyVariants,
    active,
    backfill,
    cursor: {
      lastSeenAt,
      lastPolledAt: null,
      nextPollAt: new Date(),
    },
    stats: {
      matched: 0,
      replied: 0,
      failed: 0,
    },
  });

  pickerService.clearCache();
  logger.info({ ruleId: rule._id, videoId }, "Created new YouTube video rule");
  return rule;
}

/**
 * Updates an existing video rule
 * @param {string} id
 * @param {object} data
 * @returns {Promise<YtVideoRule>}
 */
async function updateRule(id, data = {}) {
  const rule = await getRuleById(id);

  if (data.keywords !== undefined) {
    rule.keywords = normalizeKeywords(data.keywords);
  }

  if (data.link !== undefined) {
    rule.link = normalizeLink(data.link);
  }

  if (data.replyVariants !== undefined) {
    rule.replyVariants = normalizeReplyVariants(data.replyVariants);
  }

  if (data.matchMode !== undefined) {
    if (!["word", "exact", "contains"].includes(data.matchMode)) {
      throw new ValidationError("matchMode must be one of: word, exact, contains");
    }
    rule.matchMode = data.matchMode;
  }

  if (data.title !== undefined && typeof data.title === "string") {
    rule.title = data.title.trim() || rule.title;
  }

  if (data.active !== undefined) {
    const newActive = data.active === true || data.active === "true" || data.active === "on" || data.active === "1";
    // If reactivating from inactive, reset cursor to now
    if (!rule.active && newActive) {
      rule.cursor.lastSeenAt = new Date();
      rule.cursor.nextPollAt = new Date();
    }
    rule.active = newActive;
  }

  await rule.save();
  pickerService.clearCache();
  logger.info({ ruleId: rule._id, videoId: rule.videoId }, "Updated YouTube video rule");
  return rule;
}

/**
 * Toggles a rule between active and inactive.
 * When reactivating a paused rule, resets cursor.lastSeenAt to now so comments while paused are ignored.
 * @param {string} id
 * @returns {Promise<YtVideoRule>}
 */
async function toggleRule(id) {
  const rule = await getRuleById(id);
  const wasActive = rule.active;
  rule.active = !wasActive;

  // When reactivating from paused, reset lastSeenAt to now
  if (!wasActive && rule.active) {
    rule.cursor.lastSeenAt = new Date();
    rule.cursor.nextPollAt = new Date();
  }

  await rule.save();
  pickerService.clearCache();
  logger.info({ ruleId: rule._id, videoId: rule.videoId, active: rule.active }, "Toggled YouTube video rule status");
  return rule;
}

/**
 * Deletes a video rule
 * @param {string} id
 * @returns {Promise<YtVideoRule>}
 */
async function deleteRule(id) {
  const rule = await getRuleById(id);
  await YtVideoRule.findByIdAndDelete(rule._id);
  pickerService.clearCache();
  logger.info({ ruleId: rule._id, videoId: rule.videoId }, "Deleted YouTube video rule");
  return rule;
}

module.exports = {
  listRules,
  getRuleById,
  getRuleByVideoId,
  createRule,
  updateRule,
  toggleRule,
  deleteRule,
  normalizeKeywords,
  normalizeLink,
  normalizeReplyVariants,
};
