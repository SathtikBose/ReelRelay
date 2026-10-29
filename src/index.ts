import { Hono } from "hono";
import webhookRouter from "./routes/webhook";

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

// Mount webhook routes (/webhook GET and POST)
app.route("/", webhookRouter);

export default app;
