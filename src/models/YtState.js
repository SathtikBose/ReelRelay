const mongoose = require("mongoose");

const ytStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "youtube",
      unique: true,
      required: true,
    },
    quotaDayKey: {
      type: String,
      default: "",
      trim: true,
    },
    quotaUsed: {
      type: Number,
      default: 0,
    },
    quotaExceededUntil: {
      type: Date,
      default: null,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastPollAt: {
      type: Date,
      default: null,
    },
    lastPollStatus: {
      type: String,
      enum: {
        values: ["ok", "error", "skipped", "idle"],
        message: "lastPollStatus must be one of: ok, error, skipped, idle",
      },
      default: "idle",
    },
    lastPollSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        rules: 0,
        comments: 0,
        replies: 0,
        errors: 0,
      }),
    },
  },
  {
    timestamps: true,
    collection: "yt_state",
  }
);

const YtState = mongoose.model("YtState", ytStateSchema);

module.exports = {
  YtState,
};
