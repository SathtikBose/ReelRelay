const express = require("express");
const dashboardRoutes = require("./dashboard");
const reelsRoutes = require("./reels");
const activityRoutes = require("./activity");
const settingsRoutes = require("./settings");
const apiRoutes = require("./api");

const router = express.Router();

router.use("/", dashboardRoutes);
router.use("/reels", reelsRoutes);
router.use("/activity", activityRoutes);
router.use("/settings", settingsRoutes);
router.use("/api", apiRoutes);

module.exports = router;
