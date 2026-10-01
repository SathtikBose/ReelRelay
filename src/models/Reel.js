const mongoose = require("mongoose");

const DEFAULT_DM_TEMPLATE = "Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}";

const reelSchema = new mongoose.Schema(
  {
    mediaId: {
      type: String,
      required: [true, "mediaId is required"],
      unique: true,
      trim: true,
      validate: {
        validator: (v) => /^\d+$/.test(v),
        message: "mediaId must contain digits only",
      },
    },
    permalink: {
      type: String,
      trim: true,
      default: "",
    },
    caption: {
      type: String,
      maxlength: [2200, "caption cannot exceed 2200 characters"],
      default: "",
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: "",
    },
    keywords: {
      type: [String],
      required: [true, "At least one keyword is required"],
      validate: [
        {
          validator: (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 10,
          message: "Keywords must have between 1 and 10 items",
        },
        {
          validator: (arr) => {
            const unique = new Set(arr.map((k) => (typeof k === "string" ? k.trim().toLowerCase() : "")));
            return unique.size === arr.length && !unique.has("");
          },
          message: "Keywords must be non-empty, unique, and valid strings",
        },
        {
          validator: (arr) => arr.every((k) => typeof k === "string" && k.trim().length >= 1 && k.trim().length <= 30),
          message: "Each keyword must be between 1 and 30 characters",
        },
      ],
      set: (arr) =>
        Array.isArray(arr)
          ? [...new Set(arr.map((k) => (typeof k === "string" ? k.trim().toLowerCase() : "")).filter(Boolean))]
          : arr,
    },
    matchMode: {
      type: String,
      enum: {
        values: ["word", "exact", "contains"],
        message: "matchMode must be 'word', 'exact', or 'contains'",
      },
      default: "word",
    },
    link: {
      type: String,
      required: [true, "link is required"],
      maxlength: [2000, "link cannot exceed 2000 characters"],
      trim: true,
      validate: {
        validator: (v) => {
          try {
            const parsed = new URL(v);
            return parsed.protocol === "https:";
          } catch {
            return false;
          }
        },
        message: "link must be a valid https:// URL",
      },
    },
    dmTemplate: {
      type: String,
      maxlength: [800, "dmTemplate cannot exceed 800 characters"],
      default: DEFAULT_DM_TEMPLATE,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    stats: {
      matched: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

const Reel = mongoose.models.Reel || mongoose.model("Reel", reelSchema);

module.exports = {
  Reel,
  DEFAULT_DM_TEMPLATE,
};
