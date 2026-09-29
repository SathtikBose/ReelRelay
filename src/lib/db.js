const mongoose = require("mongoose");
const { env } = require("../config/env");
const { logger } = require("./logger");

/**
 * Checks current MongoDB connection state
 * @returns {"connected" | "disconnected"}
 */
function getConnectionState() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}

/**
 * Connects to MongoDB Atlas / Local MongoDB
 * @param {string} [uri=env.MONGODB_URI]
 * @returns {Promise<typeof mongoose>}
 */
async function connectDb(uri = env.MONGODB_URI) {
  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connection established successfully");
  });

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB connection disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("MongoDB connection reestablished");
  });

  const opts = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    autoIndex: true,
  };

  return mongoose.connect(uri, opts);
}

/**
 * Closes the MongoDB connection
 * @returns {Promise<void>}
 */
async function disconnectDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info("MongoDB connection closed");
  }
}

module.exports = {
  connectDb,
  disconnectDb,
  getConnectionState,
};
