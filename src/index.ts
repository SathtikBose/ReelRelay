import { Hono } from "hono";
import webhookRouter from "./routes/webhook";
import apiRouter from "./routes/api";
import { verifySignedSession } from "./lib/auth";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  NODE_ENV?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  IG_BUSINESS_ACCOUNT_ID?: string;
  GRAPH_API_VERSION?: string;
  // Backward compatibility bindings
  IG_APP_ID?: string;
  IG_APP_SECRET?: string;
  IG_VERIFY_TOKEN?: string;
  IG_USER_ID?: string;
  IG_ACCESS_TOKEN?: string;
  IG_API_VERSION?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /health — Public health check endpoint for manual checks
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "2.0.0",
    service: "ReelRelay Instagram Automation",
    runtime: "Cloudflare Workers",
    timestamp: new Date().toISOString(),
  });
});

// Mount Webhook routes (/webhook GET and POST)
app.route("/", webhookRouter);

// Mount API routes (/api/* and backward-compatible /admin/instagram/api/*)
app.route("/api", apiRouter);
app.route("/admin/instagram/api", apiRouter);

// GET /login — Serves login page from static assets
app.get("/login", async (c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === "function") {
    const url = new URL("/login.html", c.req.url);
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }
  return c.text("Login page not found", 404);
});

// GET /admin — Redirects to /
app.get("/admin", (c) => {
  return c.redirect("/");
});

// GET / — Serves authenticated dashboard or redirects to /login
app.get("/", async (c) => {
  const cookie = c.req.header("cookie");
  const secret = c.env.SESSION_SECRET || "";
  const isAuthed = await verifySignedSession(cookie, secret);

  if (!isAuthed) {
    return c.redirect("/login");
  }

  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === "function") {
    const url = new URL("/index.html", c.req.url);
    return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  }

  return c.text("Dashboard page not found", 404);
});

// Fallback to static assets (css, js, images)
app.get("/*", async (c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === "function") {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.notFound();
});

export default app;
