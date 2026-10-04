#!/usr/bin/env node
const { connectDb, disconnectDb } = require("../src/lib/db");
const { YtVideoRule } = require("../src/models/YtVideoRule");
const { parseYouTubeVideoId } = require("../src/services/youtube/urlParser");
const { logger } = require("../src/lib/logger");

/**
 * Parses CLI arguments into an object
 * @param {string[]} args
 * @returns {Record<string, string>}
 */
function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

async function seed() {
  const rawArgs = process.argv.slice(2);
  const flags = parseArgs(rawArgs);

  const rawVideo = flags.video || flags.videoId || flags.url;
  const rawKeywords = flags.keyword || flags.keywords || "LINK";
  const link = flags.link;
  const matchMode = flags.mode || flags.matchMode || "word";
  const title = flags.title || "CLI Seeded YouTube Video";
  const backfill = flags.backfill === "true" || flags.backfill === true;

  const videoId = parseYouTubeVideoId(rawVideo);
  if (!videoId) {
    // eslint-disable-next-line no-console
    console.error("Usage: node scripts/seedYtRule.js --video <videoIdOrUrl> --keyword <keyword> --link <https://link> [--mode word|exact|contains] [--title <title>] [--backfill]");
    process.exit(1);
  }

  if (!link || !link.startsWith("https://")) {
    // eslint-disable-next-line no-console
    console.error("Error: --link must be a valid https:// URL");
    process.exit(1);
  }

  const keywords = rawKeywords
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  try {
    await connectDb();
    logger.info({ videoId, keywords, link, matchMode }, "Seeding YouTube video rule...");

    const lastSeenAt = backfill ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) : new Date();

    const updated = await YtVideoRule.findOneAndUpdate(
      { videoId },
      {
        videoId,
        title,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        keywords,
        link,
        matchMode,
        active: true,
        backfill,
        cursor: {
          lastSeenAt,
          nextPollAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info({ id: updated._id, videoId: updated.videoId }, "Successfully seeded YouTube video rule!");
    await disconnectDb();
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message }, "Failed to seed YouTube video rule");
    await disconnectDb();
    process.exit(1);
  }
}

if (require.main === module) {
  seed();
}

module.exports = {
  parseArgs,
};
