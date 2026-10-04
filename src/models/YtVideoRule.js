const mongoose = require("mongoose");

const DEFAULT_REPLY_VARIANTS = [
  "Here you go 👉 {{link}}",
  "Thanks for commenting! Link: {{link}}",
  "Sharing the link as promised: {{link}}",
];

const ytVideoRuleSchema = new mongoose.Schema(
  {
    videoId: {
      type: String,
      required: [true, "YouTube video ID is required"],
      unique: true,
      trim: true,
      match: [/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube video ID format (11 characters required)"],
    },
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    thumbnailUrl: {
      type: String,
      default: "",
      trim: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    isShort: {
      type: Boolean,
      default: false,
    },
    keywords: {
      type: [String],
      required: [true, "At least one keyword is required"],
      validate: [
        {
          validator: (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 10,
          message: "A rule must have between 1 and 10 keywords",
        },
      ],
      set: (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr.map((k) => (k || "").trim().toLowerCase()).filter(Boolean);
      },
    },
    matchMode: {
      type: String,
      enum: {
        values: ["word", "exact", "contains"],
        message: "matchMode must be one of: word, exact, contains",
      },
      default: "word",
    },
    link: {
      type: String,
      required: [true, "Link is required"],
      trim: true,
      maxlength: [2000, "Link cannot exceed 2000 characters"],
      validate: {
        validator: (v) => {
          if (typeof v !== "string") return false;
          try {
            const parsed = new URL(v);
            return parsed.protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "Link must be a valid HTTPS URL (https://)",
      },
    },
    replyVariants: {
      type: [String],
      default: DEFAULT_REPLY_VARIANTS,
      validate: [
        {
          validator: (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 5,
          message: "A rule must have between 1 and 5 reply variants",
        },
        {
          validator: (arr) => arr.every((v) => typeof v === "string" && v.length <= 500 && v.trim().length > 0),
          message: "Each reply variant must be a non-empty string under 500 characters",
        },
      ],
    },
    active: {
      type: Boolean,
      default: true,
    },
    backfill: {
      type: Boolean,
      default: false,
    },
    cursor: {
      lastSeenAt: {
        type: Date,
        default: null,
      },
      lastPolledAt: {
        type: Date,
        default: null,
      },
      nextPollAt: {
        type: Date,
        default: () => new Date(),
      },
    },
    stats: {
      matched: {
        type: Number,
        default: 0,
      },
      replied: {
        type: Number,
        default: 0,
      },
      failed: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    collection: "yt_video_rules",
  }
);

ytVideoRuleSchema.index({ active: 1, "cursor.nextPollAt": 1 });

const YtVideoRule = mongoose.model("YtVideoRule", ytVideoRuleSchema);

module.exports = {
  YtVideoRule,
  DEFAULT_REPLY_VARIANTS,
};
