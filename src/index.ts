import { Hono } from "hono";

export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  NODE_ENV?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  IG_APP_ID?: string;
  IG_APP_SECRET?: string;
  IG_VERIFY_TOKEN?: string;
  IG_USER_ID?: string;
  IG_ACCESS_TOKEN?: string;
  IG_API_VERSION?: string;
  GRAPH_API_VERSION?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// GET /health — Health check endpoint for manual checks
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "2.0.0",
    service: "ReelRelay Instagram Automation",
    runtime: "Cloudflare Workers",
    timestamp: new Date().toISOString(),
  });
});

export default app;
