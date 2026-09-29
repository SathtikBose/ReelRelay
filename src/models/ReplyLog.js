const mongoose = require("mongoose");
const { env } = require("../config/env");

const replyLogSchema = new mongoose.Schema(
  {
    commentId: {
      type: String,
      required: [true, "commentId is required"],
      unique: true,
      trim: true,
    },
    mediaId: {
      type: String,
      trim: true,
      default: "",
    },
    reelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel",
      default: null,
    },
    commenterId: {
      type: String,
      trim: true,
      default: "",
    },
    commenterUsername: {
      type: String,
      trim: true,
      default: "",
    },
    commentText: {
      type: String,
      maxlength: [300, "commentText cannot exceed 300 characters"],
      set: (val) => (typeof val === "string" ? val.slice(0, 300) : ""),
      default: "",
    },
    matchedKeyword: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: {
        values: ["processing", "sent", "failed", "skipped"],
        message: "status must be 'processing', 'sent', 'failed', or 'skipped'",
      },
      default: "processing",
    },
    skipReason: {
      type: String,
      enum: {
        values: [
          "no_rule",
          "inactive",
          "no_match",
          "duplicate_user",
          "own_comment",
          "reply_comment",
          null,
        ],
        message: "Invalid skipReason",
      },
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    errorCode: {
      type: String,
      default: "",
    },
    errorMessage: {
      type: String,
      default: "",
    },
    messageId: {
      type: String,
      default: "",
    },
    commentedAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
  }
);

// Compound indexes
replyLogSchema.index({ mediaId: 1, commenterId: 1, status: 1 });
replyLogSchema.index({ status: 1, createdAt: -1 });

// TTL index to automatically purge logs after configured TTL days (default 60)
const ttlSeconds = (env.LOG_TTL_DAYS || 60) * 86400;
replyLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds });

const ReplyLog = mongoose.models.ReplyLog || mongoose.model("ReplyLog", replyLogSchema);

module.exports = {
  ReplyLog,
};
