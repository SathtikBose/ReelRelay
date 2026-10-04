#!/usr/bin/env node
const { connectDb, disconnectDb } = require("../src/lib/db");
const poller = require("../src/services/youtube/poller");
const { logger } = require("../src/lib/logger");

async function run() {
  try {
    await connectDb();
    logger.info("Executing manual YouTube poll cycle from CLI...");

    const result = await poller.pollOnce({ force: true });

    // eslint-disable-next-line no-console
    console.log("\n--- YouTube Poll Cycle Result ---");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));

    await disconnectDb();
    process.exit(result.status === "ok" || result.skipped ? 0 : 1);
  } catch (err) {
    logger.error({ err: err.message }, "Error during CLI YouTube pollOnce");
    await disconnectDb();
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  run,
};
