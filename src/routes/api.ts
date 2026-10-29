import { Hono } from "hono";
import { Bindings } from "../index";
import {
  createSignedSession,
  verifySignedSession,
  verifyAdminPassword,
  checkLoginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
  buildSessionCookie,
  buildLogoutCookie,
} from "../lib/auth";
import {
  getKeywordRules,
  getKeywordRuleById,
  createKeywordRule,
  updateKeywordRule,
  toggleKeywordRule,
  deleteKeywordRule,
  getProcessedComments,
} from "../lib/db";
import { logger } from "../lib/logger";

const apiRouter = new Hono<{ Bindings: Bindings }>();

// Helper to get client IP for rate limiting
function getClientIp(c: any): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "127.0.0.1"
  );
}

// ----------------------------------------------------
// Public Auth Endpoints
// ----------------------------------------------------

// POST /api/auth/login — Authenticates admin password and issues signed session cookie
apiRouter.post("/auth/login", async (c) => {
  const ip = getClientIp(c);
  const rateLimit = checkLoginRateLimit(ip);

  if (!rateLimit.allowed) {
    logger.warn({ ip, retryAfterSec: rateLimit.retryAfterSec }, "Login rate limit exceeded");
    return c.json(
      {
        error: `Too many failed login attempts. Please try again in ${rateLimit.retryAfterSec} seconds.`,
      },
      429
    );
  }

  let body: { password?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const { password } = body;
  const expectedPassword = c.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    logger.error({}, "ADMIN_PASSWORD binding is not configured in environment");
    return c.json({ error: "Server authentication configuration error" }, 500);
  }

  const secret = c.env.SESSION_SECRET;
  if (!secret) {
    logger.error({}, "SESSION_SECRET binding is not configured in environment");
    return c.json({ error: "Server session configuration error" }, 500);
  }

  const isValid = verifyAdminPassword(password, expectedPassword);

  if (!isValid) {
    recordFailedLogin(ip);
    logger.warn({ ip }, "Invalid admin login attempt");
    return c.json({ error: "Incorrect password" }, 401);
  }

  clearFailedLogins(ip);
  logger.info({ ip }, "Successful admin login");

  const sessionToken = await createSignedSession(secret);
  const cookieHeader = buildSessionCookie(sessionToken);

  c.header("Set-Cookie", cookieHeader);
  return c.json({ success: true, message: "Logged in successfully" });
});

// POST /api/auth/logout — Clears session cookie
apiRouter.post("/auth/logout", (c) => {
  c.header("Set-Cookie", buildLogoutCookie());
  return c.json({ success: true, message: "Logged out successfully" });
});

// GET /api/auth/me — Checks session validity
apiRouter.get("/auth/me", async (c) => {
  const cookieHeader = c.req.header("cookie");
  const secret = c.env.SESSION_SECRET || "";
  const isValid = await verifySignedSession(cookieHeader, secret);

  if (!isValid) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({ authenticated: true });
});

// ----------------------------------------------------
// Protected API Routes (Protected by Signed Session Cookie)
// ----------------------------------------------------

apiRouter.use("/*", async (c, next) => {
  // Allow public auth endpoints
  if (c.req.path.startsWith("/api/auth/")) {
    return next();
  }

  const cookieHeader = c.req.header("cookie");
  const secret = c.env.SESSION_SECRET || "";
  const isValid = await verifySignedSession(cookieHeader, secret);

  if (!isValid) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Please log in to access this resource",
      },
      401
    );
  }

  return next();
});

// GET /api/keywords — List all keyword rules
apiRouter.get("/keywords", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: "Database binding not available" }, 500);
  }

  const rules = await getKeywordRules(c.env.DB);
  return c.json({ data: rules });
});

// POST /api/keywords — Create a new keyword rule
apiRouter.post("/keywords", async (c) => {
  if (!c.env.DB) {
    return c.json({ error: "Database binding not available" }, 500);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const mediaId = typeof body.mediaId === "string" ? body.mediaId.trim() : "";
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const link = typeof body.link === "string" ? body.link.trim() : "";

  if (!mediaId || !keyword || !link) {
    return c.json(
      { error: "mediaId, keyword, and link are required fields" },
      400
    );
  }

  try {
    new URL(link);
    if (!link.startsWith("https://")) {
      return c.json({ error: "Link must use HTTPS protocol (https://)" }, 400);
    }
  } catch {
    return c.json({ error: "Link must be a valid HTTPS URL" }, 400);
  }

  try {
    const created = await createKeywordRule(c.env.DB, {
      mediaId,
      keyword,
      matchMode: body.matchMode || "word",
      link,
      dmMessage: body.dmMessage,
      active: body.active !== false,
      caption: body.caption || "",
    });

    return c.json({ success: true, data: created }, 201);
  } catch (err: any) {
    logger.error({ err }, "Error creating keyword rule");
    return c.json({ error: err?.message || "Failed to create rule" }, 500);
  }
});

// GET /api/keywords/:id — Get rule by ID
apiRouter.get("/keywords/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid rule ID" }, 400);
  }

  const rule = await getKeywordRuleById(c.env.DB, id);
  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({ data: rule });
});

// PUT /api/keywords/:id — Update existing rule
apiRouter.put("/keywords/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid rule ID" }, 400);
  }

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (body.link) {
    try {
      new URL(body.link);
      if (!body.link.startsWith("https://")) {
        return c.json({ error: "Link must use HTTPS protocol (https://)" }, 400);
      }
    } catch {
      return c.json({ error: "Link must be a valid HTTPS URL" }, 400);
    }
  }

  const updated = await updateKeywordRule(c.env.DB, id, body);
  if (!updated) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({ success: true, data: updated });
});

// POST /api/keywords/:id/toggle — Toggle active/paused state
apiRouter.post("/keywords/:id/toggle", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid rule ID" }, 400);
  }

  const success = await toggleKeywordRule(c.env.DB, id);
  if (!success) {
    return c.json({ error: "Rule not found" }, 404);
  }

  const rule = await getKeywordRuleById(c.env.DB, id);
  return c.json({ success: true, active: rule?.active === 1 });
});

// DELETE /api/keywords/:id — Delete rule
apiRouter.delete("/keywords/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid rule ID" }, 400);
  }

  const success = await deleteKeywordRule(c.env.DB, id);
  if (!success) {
    return c.json({ error: "Rule not found" }, 404);
  }

  return c.json({ success: true });
});

// GET /api/activity — Recent processed comments log
apiRouter.get("/activity", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "25", 10), 100);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const status = c.req.query("status") || "all";

  const { items, total } = await getProcessedComments(c.env.DB, limit, offset, status);
  return c.json({ data: items, total });
});

// GET /api/stats — Summary metrics for the dashboard header
apiRouter.get("/stats", async (c) => {
  const rules = await getKeywordRules(c.env.DB);

  let totalMatched = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let activeRules = 0;

  for (const rule of rules) {
    if (rule.active) activeRules++;
    totalMatched += rule.matched_count || 0;
    totalSent += rule.sent_count || 0;
    totalFailed += rule.failed_count || 0;
  }

  return c.json({
    stats: {
      totalRules: rules.length,
      activeRules,
      totalMatched,
      totalSent,
      totalFailed,
    },
  });
});

export default apiRouter;
