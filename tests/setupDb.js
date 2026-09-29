const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

async function startDb() {
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
  }
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoServer.getUri());
  }
  return mongoServer;
}

async function stopDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

async function clearDb() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
}

module.exports = {
  startDb,
  stopDb,
  clearDb,
};
