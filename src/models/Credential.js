const mongoose = require("mongoose");

const credentialSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "instagram",
    },
    igUserId: {
      type: String,
      trim: true,
      default: "",
    },
    tokenCipher: {
      type: String,
      required: [true, "tokenCipher is required"],
    },
    tokenIv: {
      type: String,
      required: [true, "tokenIv is required"],
    },
    tokenTag: {
      type: String,
      required: [true, "tokenTag is required"],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    lastRefreshedAt: {
      type: Date,
      default: null,
    },
    lastRefreshStatus: {
      type: String,
      enum: {
        values: ["ok", "error", null],
        message: "lastRefreshStatus must be 'ok', 'error', or null",
      },
      default: null,
    },
    lastRefreshError: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

const Credential = mongoose.models.Credential || mongoose.model("Credential", credentialSchema);

module.exports = {
  Credential,
};
