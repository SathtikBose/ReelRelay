#!/usr/bin/env node
const { connectDb, disconnectDb } = require("../src/lib/db");
const { Reel } = require("../src/models/Reel");
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

  const mediaId = flags.media || flags.mediaId;
  const rawKeywords = flags.keyword || flags.keywords || "LINK";
  const link = flags.link;
  const matchMode = flags.mode || flags.matchMode || "word";
  const caption = flags.caption || "CLI Seeded Reel";

  if (!mediaId) {
    // eslint-disable-next-line no-console
    console.error("Usage: npm run seed:rule -- --media <mediaId> --keyword <keyword> --link <https://link> [--mode word|exact|contains]");
    process.exit(1);
  }

  if (!link || !link.startsWith("https://")) {
    // eslint-disable-next-line no-console
    console.error("Error: --link must be a valid https:// URL");
    process.exit(1);
  }

  const keywords = rawKeywords.split(",").map((k) => k.trim()).filter(Boolean);

  try {
    await connectDb();
    logger.info({ mediaId, keywords, link, matchMode }, "Seeding reel rule...");

    const updated = await Reel.findOneAndUpdate(
      { mediaId },
      {
        mediaId,
        keywords,
        link,
        matchMode,
        caption,
        active: true,
      },
      { upsert: true, new: true, runValidators: true }
    );

    logger.info({ id: updated._id, mediaId: updated.mediaId }, "Successfully seeded reel rule!");
    await disconnectDb();
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message }, "Failed to seed reel rule");
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
