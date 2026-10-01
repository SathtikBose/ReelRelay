const express = require("express");
const instagramClient = require("../../services/instagramClient");
const { Reel } = require("../../models/Reel");
const { logger } = require("../../lib/logger");

const router = express.Router();

// GET /admin/api/media (reel picker endpoint)
router.get("/media", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 50);
    const after = req.query.after || null;

    const mediaResponse = await instagramClient.listRecentMedia(limit, after);
    const rawItems = mediaResponse.data || [];

    // Filter to REELS or VIDEO
    const reelsOnly = rawItems.filter(
      (item) => item.media_product_type === "REELS" || item.media_type === "VIDEO"
    );

    // Check existing rules in DB to mark which media items already have rules
    const mediaIds = reelsOnly.map((item) => item.id);
    const existingRules = await Reel.find({ mediaId: { $in: mediaIds } })
      .select("mediaId")
      .lean();
    const existingIds = new Set(existingRules.map((r) => r.mediaId));

    const formattedData = reelsOnly.map((item) => ({
      id: item.id,
      caption: item.caption || "",
      mediaType: item.media_type,
      mediaProductType: item.media_product_type,
      permalink: item.permalink,
      thumbnailUrl: item.thumbnail_url || null,
      timestamp: item.timestamp,
      hasRule: existingIds.has(item.id),
    }));

    return res.json({
      data: formattedData,
      paging: mediaResponse.paging || null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch Instagram media for picker");
    return res.status(502).json({
      error: {
        code: "MEDIA_FETCH_FAILED",
        message: err.message || "Failed to fetch recent reels from Instagram",
      },
    });
  }
});

module.exports = router;
