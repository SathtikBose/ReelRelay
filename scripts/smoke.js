#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Smoke test script for ReelRelay
 * Verifies live or local instance endpoints: health, webhook handshake, signature checks, admin login.
 *
 * Usage:
 *   node scripts/smoke.js https://reelrelay.onrender.com
 *   npm run smoke -- https://reelrelay.onrender.com
 */

const { env } = require("../src/config/env");

async function runSmokeTests(targetUrl, verifyToken = env.IG_VERIFY_TOKEN) {
  const base = targetUrl.replace(/\/+$/, "");
  const isSilent = process.env.NODE_ENV === "test";
  if (!isSilent) {
    console.log(`\n🔍 Running ReelRelay Smoke Tests against: ${base}\n`);
  }

  let passed = 0;
  let failed = 0;

  async function check(name, testFn) {
    try {
      await testFn();
      if (!isSilent) {
        console.log(`  ✅ [PASS] ${name}`);
      }
      passed++;
    } catch (err) {
      if (!isSilent) {
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      }
      failed++;
    }
  }

  // 1. Health check
  await check("GET /health returns 200 and DB status", async () => {
    const res = await fetch(`${base}/health`);
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    const json = await res.json();
    if (json.status !== "ok") {
      throw new Error(`Expected status 'ok', got '${json.status}'`);
    }
  });

  // 2. Valid Webhook Handshake
  await check("GET /webhook with valid verify token returns 200 challenge", async () => {
    const challenge = "smoke_challenge_" + Date.now();
    const url = `${base}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
      verifyToken
    )}&hub.challenge=${challenge}`;
    const res = await fetch(url);
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    const text = await res.text();
    if (text !== challenge) {
      throw new Error(`Expected challenge response '${challenge}', got '${text}'`);
    }
  });

  // 3. Invalid Webhook Handshake
  await check("GET /webhook with invalid verify token returns 403 Forbidden", async () => {
    const url = `${base}/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=12345`;
    const res = await fetch(url);
    if (res.status !== 403) {
      throw new Error(`Expected HTTP 403, got ${res.status}`);
    }
  });

  // 4. Webhook without signature header
  await check("POST /webhook without signature header returns 401 Unauthorized", async () => {
    const res = await fetch(`${base}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "instagram", entry: [] }),
    });
    if (res.status !== 401) {
      throw new Error(`Expected HTTP 401, got ${res.status}`);
    }
  });

  // 5. Webhook with invalid signature header
  await check("POST /webhook with invalid signature returns 401 Unauthorized", async () => {
    const res = await fetch(`${base}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": "sha256=invalidhexsignature00000000000000000000000000000000000000000000",
      },
      body: JSON.stringify({ object: "instagram", entry: [] }),
    });
    if (res.status !== 401) {
      throw new Error(`Expected HTTP 401, got ${res.status}`);
    }
  });

  // 6. Admin Login Page
  await check("GET /admin/login renders login page with 200 OK", async () => {
    const res = await fetch(`${base}/admin/login`);
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    const html = await res.text();
    if (!html.includes("Admin Login") && !html.includes("Password")) {
      throw new Error("Admin login page missing expected form elements");
    }
  });

  if (!isSilent) {
    console.log(`\n📊 Smoke Test Summary: ${passed} passed, ${failed} failed.\n`);
  }
  return { passed, failed, success: failed === 0 };
}

if (require.main === module) {
  const targetUrl = process.argv[2] || env.BASE_URL || "http://localhost:3000";
  runSmokeTests(targetUrl)
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal error running smoke tests:", err);
      process.exit(1);
    });
}

module.exports = {
  runSmokeTests,
};
