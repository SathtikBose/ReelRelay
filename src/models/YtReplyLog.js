const mongoose = require("mongoose");
const { env } = require("../config/env");

const ytReplyLogSchema = new mongoose.Schema(
  {
    commentId: {
      type: String,
      required: [true, "YouTube comment ID is required"],
      unique: true,
      trim: true,
    },
    videoId: {
      type: String,
      required: [true, "Video ID is required"],
      trim: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "YtVideoRule",
      default: null,
    },
    authorChannelId: {
      type: String,
      default: "",
      trim: true,
    },
    authorName: {
      type: String,
      default: "",
      trim: true,
    },
    commentText: {
      type: String,
      default: "",
      set: (v) => (v || "").slice(0, 300),
    },
    matchedKeyword: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ["processing", "posted", "failed", "skipped", "deferred"],
        message: "Status must be one of: processing, posted, failed, skipped, deferred",
      },
      default: "processing",
    },
    skipReason: {
      type: String,
      default: "",
      enum: {
        values: ["own_comment", "no_match", "hourly_cap", "inactive", "duplicate", ""],
        message: "Invalid skipReason enum",
      },
    },
    replyText: {
      type: String,
      default: "",
    },
    replyCommentId: {
      type: String,
      default: "",
      trim: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    errorCode: {
      type: String,
      default: "",
      trim: true,
    },
    errorMessage: {
      type: String,
      default: "",
      set: (v) => (v || "").slice(0, 500),
    },
    quotaCost: {
      type: Number,
      default: 0,
    },
    commentedAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "yt_reply_logs",
  }
);

// Query indexes
ytReplyLogSchema.index({ status: 1, createdAt: -1 });
ytReplyLogSchema.index({ videoId: 1, createdAt: -1 });
ytReplyLogSchema.index({ status: 1, processedAt: 1 });

// TTL index for automated log retention purge
const ttlSeconds = (env.LOG_TTL_DAYS || 60) * 24 * 60 * 60;
ytReplyLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds });

const YtReplyLog = mongoose.model("YtReplyLog", ytReplyLogSchema);

module.exports = {
  YtReplyLog,
};
