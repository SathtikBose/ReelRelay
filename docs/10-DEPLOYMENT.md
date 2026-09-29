# 10 — Deployment (100% free)

## 1. Local development
1. `cp .env.example .env` and fill values (`06-META-SETUP.md`).
2. `npm install && npm run dev` (port 3000).
3. Expose it: `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`).
4. Put `https://<tunnel-host>/webhook` in the Meta webhook config. Free tunnel URLs change on restart — update Meta each time.
5. Local mode only works while your laptop and tunnel are running.

## 2. MongoDB Atlas (M0)
1. Create a free cluster; create DB user (`readWrite` on `reelrelay`), strong password.
2. Network Access: allow `0.0.0.0/0` (Render free has no fixed IP).
3. Copy the `mongodb+srv://` URI → `MONGODB_URI`. Use separate DB names for dev (`reelrelay_dev`) and prod (`reelrelay`).
4. Free-tier limits may change — check Atlas pricing when creating the cluster.

## 3. Render (free web service)
1. Push repo to GitHub (private is fine).
2. Render → New → Web Service → connect repo.
3. Settings:
   - Runtime: Node, region closest to you.
   - Build command: `npm ci`
   - Start command: `npm start`
   - Instance type: **Free**
   - Health check path: `/health`
   - Auto-deploy: on push to `main`.
4. Environment variables: everything in `03-TECH-STACK.md` §6. Set `NODE_ENV=production`, `BASE_URL=https://<service>.onrender.com`.
5. Facts to design around (from Render docs): free web services spin down after 15 minutes without inbound traffic, take up to about a minute to start again, and have an **ephemeral filesystem** — never store data on disk (all state is in MongoDB).

## 4. UptimeRobot (keep-alive)
1. Create a free account → Add New Monitor → type **HTTP(s)**.
2. URL: `https://<service>.onrender.com/health`, interval 5 minutes.
3. Optional: email alert on downtime.
Pings count as inbound traffic, which prevents the spin-down. `/health` must be fast and must not call Instagram.

## 5. Point Meta at production
1. Instagram API setup → Webhooks → change Callback URL to `https://<service>.onrender.com/webhook`, same verify token → Verify and Save.
2. Confirm `comments` subscription is still active.
3. Run `npm run smoke -- https://<service>.onrender.com`.
4. Live test with second account on a real reel.

## 6. Post-deploy checklist
- [ ] `/health` returns 200 with `db: "connected"`.
- [ ] Admin login works over HTTPS; cookie flagged `Secure`.
- [ ] Rule created in admin → matching comment → DM received.
- [ ] Token status shows expiry ≈ 60 days; refresh job logged on boot.
- [ ] UptimeRobot monitor is Up for 24 h with no gaps.

## 7. Operations
- **Logs:** Render dashboard → Logs (pino JSON).
- **Rollback:** Render → Deploys → redeploy previous commit.
- **Token expired:** generate a new token in Meta dashboard, set `IG_ACCESS_TOKEN`, use Settings → "Replace token" (or clear the credential doc so bootstrap re-runs).
- **Cold start miss:** Meta retries webhooks; idempotency prevents duplicates. If a comment was missed, retry from Activity (within 7 days) once that feature exists.
- **Cost check:** if Render or Atlas ever asks for a card, stop and review; nothing in this project requires paid tiers.
