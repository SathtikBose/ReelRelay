const mongoose = require("mongoose");

const ytCredentialSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "youtube",
      unique: true,
      required: true,
    },
    channelId: {
      type: String,
      default: "",
      trim: true,
    },
    channelTitle: {
      type: String,
      default: "",
      trim: true,
    },
    uploadsPlaylistId: {
      type: String,
      default: "",
      trim: true,
    },
    refreshCipher: {
      type: String,
      required: [true, "Encrypted refresh token cipher is required"],
    },
    refreshIv: {
      type: String,
      required: [true, "Encryption IV is required"],
    },
    refreshTag: {
      type: String,
      required: [true, "Encryption auth tag is required"],
    },
    scopes: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ["connected", "needs_reauth", "disconnected"],
        message: "Status must be one of: connected, needs_reauth, disconnected",
      },
      default: "connected",
    },
    connectedAt: {
      type: Date,
      default: Date.now,
    },
    lastRefreshedAt: {
      type: Date,
      default: Date.now,
    },
    lastError: {
      type: String,
      default: "",
      set: (v) => (v || "").slice(0, 500),
    },
  },
  {
    timestamps: true,
    collection: "yt_credentials",
  }
);

const YtCredential = mongoose.model("YtCredential", ytCredentialSchema);

module.exports = {
  YtCredential,
};
