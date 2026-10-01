const express = require("express");
const packageJson = require("../../package.json");
const { getConnectionState } = require("../lib/db");

const router = express.Router();

/**
 * GET /health
 * Public health check endpoint for uptime monitors
 */
router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    db: getConnectionState(),
    version: packageJson.version || "1.0.0",
  });
});

/**
 * GET /privacy
 * Public privacy policy endpoint for Meta App Review compliance
 */
router.get("/privacy", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Privacy Policy - ReelRelay</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
        h1 { color: #111; }
      </style>
    </head>
    <body>
      <h1>Privacy Policy for ReelRelay</h1>
      <p>Last updated: October 1, 2026</p>
      <p>ReelRelay ("we", "our", or "us") provides automation tools for Instagram creators. This Privacy Policy describes how we handle information.</p>
      <h2>Information We Collect</h2>
      <p>We only process public comments and usernames on configured Instagram Reels solely for the purpose of sending requested links via Instagram Direct Messages.</p>
      <h2>Data Usage & Retention</h2>
      <p>We do not sell, rent, or monetize your personal information. Logs are maintained solely for debugging and rate limiting and are automatically purged after 60 days.</p>
      <h2>Contact</h2>
      <p>For questions regarding your privacy, contact the administrator at sathtikbose@gmail.com.</p>
    </body>
    </html>
  `);
});

/**
 * GET /terms
 * Public terms of service endpoint for Meta App Review compliance
 */
router.get("/terms", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Terms of Service - ReelRelay</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
        h1 { color: #111; }
      </style>
    </head>
    <body>
      <h1>Terms of Service for ReelRelay</h1>
      <p>Last updated: October 1, 2026</p>
      <p>By interacting with ReelRelay-enabled posts, you agree to receive automated direct messages corresponding to your keyword requests.</p>
    </body>
    </html>
  `);
});

/**
 * GET /deleteme
 * Public data deletion instructions for Meta compliance
 */
router.get("/deleteme", (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Data Deletion - ReelRelay</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
      </style>
    </head>
    <body>
      <h1>User Data Deletion Request</h1>
      <p>If you would like your comment logs deleted from ReelRelay, please contact sathtikbose@gmail.com with your Instagram username.</p>
    </body>
    </html>
  `);
});

module.exports = router;
