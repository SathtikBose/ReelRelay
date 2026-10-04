const { YtState } = require("../../models/YtState");
const { env } = require("../../config/env");
const { logger } = require("../../lib/logger");

const PACIFIC_TIMEZONE = "America/Los_Angeles";

/**
 * Computes the Pacific Time (America/Los_Angeles) day key (YYYY-MM-DD).
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. "2026-10-04"
 */
function getPacificDayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Computes the exact UTC Date of the next midnight in Pacific Time.
 * Robust against standard/daylight savings time (PST/PDT) transitions.
 * @param {Date} [now=new Date()]
 * @returns {Date}
 */
function getNextPacificMidnight(now = new Date()) {
  const currentPacificDay = getPacificDayKey(now);
  const [year, month, day] = currentPacificDay.split("-").map(Number);

  // Approximate next day noon UTC to safely step into the next calendar day
  const approxNextDay = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const nextPacificDayStr = getPacificDayKey(approxNextDay);
  const [nextYear, nextMonth, nextDayNum] = nextPacificDayStr.split("-").map(Number);

  // In Pacific timezone, midnight is between UTC 07:00 and 08:00
  // Test hour candidates in UTC to find the exact boundary where Pacific time reaches 00:00:00
  for (let hour = 6; hour <= 9; hour++) {
    const candidate = new Date(Date.UTC(nextYear, nextMonth - 1, nextDayNum, hour, 0, 0, 0));
    const pacificDay = getPacificDayKey(candidate);
    const pacificHourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: PACIFIC_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(candidate);

    const pacificHour = Number(pacificHourStr) % 24;
    if (pacificDay === nextPacificDayStr && pacificHour === 0) {
      return candidate;
    }
  }

  // Fallback if loop did not match: default to UTC 07:00 or 08:00
  return new Date(Date.UTC(nextYear, nextMonth - 1, nextDayNum, 7, 0, 0, 0));
}

/**
 * Retrieves the current YouTube quota state document, rolling over day key if needed.
 * @returns {Promise<YtState>}
 */
async function getOrCreateState() {
  const todayKey = getPacificDayKey();
  let state = await YtState.findOne({ key: "youtube" });

  if (!state) {
    state = await YtState.create({
      key: "youtube",
      quotaDayKey: todayKey,
      quotaUsed: 0,
    });
    return state;
  }

  // Check if day has rolled over
  if (state.quotaDayKey !== todayKey) {
    logger.info({ oldDay: state.quotaDayKey, newDay: todayKey }, "Rolled over YouTube quota tracking day");
    state.quotaDayKey = todayKey;
    state.quotaUsed = 0;

    // If quotaExceededUntil has passed, clear it
    if (state.quotaExceededUntil && state.quotaExceededUntil <= new Date()) {
      state.quotaExceededUntil = null;
    }

    await state.save();
  } else if (state.quotaExceededUntil && state.quotaExceededUntil <= new Date()) {
    // Clear expired quotaExceededUntil
    state.quotaExceededUntil = null;
    await state.save();
  }

  return state;
}

/**
 * Retrieves current quota usage metrics for dashboard and guards
 * @returns {Promise<{ quotaDayKey: string, quotaUsed: number, quotaBudget: number, quotaRemaining: number, isExceeded: boolean, quotaExceededUntil: Date|null, resetsAt: Date }>}
 */
async function getQuotaStatus() {
  const state = await getOrCreateState();
  const quotaBudget = env.YT_QUOTA_DAILY_BUDGET || 9000;
  const quotaUsed = state.quotaUsed || 0;
  const quotaRemaining = Math.max(0, quotaBudget - quotaUsed);
  const isExceeded =
    (state.quotaExceededUntil && state.quotaExceededUntil > new Date()) ||
    quotaUsed >= quotaBudget;

  return {
    quotaDayKey: state.quotaDayKey,
    quotaUsed,
    quotaBudget,
    quotaRemaining,
    isExceeded,
    quotaExceededUntil: state.quotaExceededUntil || null,
    resetsAt: getNextPacificMidnight(),
  };
}

/**
 * Adds estimated units to today's quota usage
 * @param {number} units
 * @returns {Promise<number>} Updated total quotaUsed
 */
async function addQuotaUsage(units = 1) {
  if (typeof units !== "number" || units <= 0) {
    return 0;
  }

  const todayKey = getPacificDayKey();

  const state = await YtState.findOneAndUpdate(
    { key: "youtube" },
    {
      $setOnInsert: { key: "youtube" },
      $inc: { quotaUsed: units },
    },
    { upsert: true, new: true }
  );

  // If the record was on an older dayKey, sync dayKey and reset usage
  if (state.quotaDayKey !== todayKey) {
    state.quotaDayKey = todayKey;
    state.quotaUsed = units;
    if (state.quotaExceededUntil && state.quotaExceededUntil <= new Date()) {
      state.quotaExceededUntil = null;
    }
    await state.save();
  }

  return state.quotaUsed;
}

/**
 * Checks if sufficient quota remains for an operation
 * @param {number} [estimatedUnits=1]
 * @returns {Promise<boolean>}
 */
async function checkQuotaAvailable(estimatedUnits = 1) {
  const status = await getQuotaStatus();
  if (status.isExceeded) {
    return false;
  }
  return status.quotaUsed + estimatedUnits <= status.quotaBudget;
}

/**
 * Records that YouTube quota has been exhausted (e.g. 403 quotaExceeded error)
 * @param {Date} [until] Optional date until which polling should pause (defaults to next Pacific midnight)
 */
async function recordQuotaExceeded(until) {
  const expiry = until instanceof Date ? until : getNextPacificMidnight();

  await YtState.updateOne(
    { key: "youtube" },
    {
      $set: {
        quotaExceededUntil: expiry,
      },
    },
    { upsert: true }
  );

  logger.warn({ quotaExceededUntil: expiry.toISOString() }, "Recorded YouTube daily quota exhaustion");
}

module.exports = {
  getPacificDayKey,
  getNextPacificMidnight,
  getQuotaStatus,
  addQuotaUsage,
  checkQuotaAvailable,
  recordQuotaExceeded,
};
