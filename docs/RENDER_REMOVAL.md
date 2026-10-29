# Render Hosting Removal Note

As part of the migration to **Cloudflare Workers**, `render.yaml` has been decommissioned and removed from this repository.

### Why Render Was Removed
1. **No Sleeping:** On the Render free tier, web services spin down after 15 minutes of inactivity, requiring external uptime pingers (e.g., UptimeRobot) which still caused cold-start delays and missed Instagram webhooks.
2. **Instant Global Edge Execution:** Cloudflare Workers run 24/7 across 300+ global data centers with 0ms cold starts, eliminating the need for any keep-alive pingers or background daemon servers.
3. **Native Serverless Architecture:** The application now runs serverlessly using Hono on Cloudflare Workers, paired with Cloudflare D1 (serverless edge SQL) and Cloudflare Workers Static Assets.

No external keep-alive cron or Render service is required.
