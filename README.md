# ReelRelay ⚡

> Production-ready, 24/7 **Instagram comment-to-DM automation bot** with a secure admin dashboard, running on **Cloudflare Workers (Hono)** and **Cloudflare D1** (serverless SQL at the edge). Zero sleeping, zero cold starts, and zero uptime pingers required.

---

## ⚡ Is It Truly 24/7?

**Yes, absolutely.** Cloudflare Workers execute on Cloudflare's serverless edge infrastructure distributed across 300+ cities worldwide. Unlike traditional free containers on Render, Heroku, or basic virtual machines, Cloudflare Workers never go to sleep, never suffer cold starts, and have no idling timeouts. The Cloudflare Workers free plan provides **100,000 requests per day every day forever**, meaning ReelRelay responds to incoming Instagram webhooks in under 50 milliseconds 24 hours a day, 7 days a week, 365 days a year—without needing UptimeRobot or any external keep-alive pingers.

---

## 🏗️ Architecture

```
                                [ Instagram Reel Comment ]
                                            │
                                            ▼
                          [ Cloudflare Workers Global Edge ]
                                            │
                   ┌────────────────────────┴────────────────────────┐
                   ▼                                                 ▼
        GET /webhook (Meta Verify)                       POST /webhook (Event Delivery)
                   │                                                 │
      [ Web Crypto Timing-Safe ]                         [ Web Crypto HMAC-SHA256 ]
                   │                                                 │
          200 hub.challenge                                   200 OK (Instant)
                                                                     │
                                                           [ ctx.waitUntil ]
                                                                     │
                                                   ┌─────────────────┴─────────────────┐
                                                   ▼                                   ▼
                                        [ Cloudflare D1 Query ]             [ Atomic Idempotency ]
                                        (Reel Rule & Keywords)             (INSERT OR IGNORE Comment)
                                                   │                                   │
                                                   └─────────────────┬─────────────────┘
                                                                     ▼
                                                          [ Keyword Matcher ]
                                                       (word / exact / contains)
                                                                     │
                                                                     ▼
                                                         [ Meta Graph API /messages ]
                                                           (Private Reply DM Sent)
```

* **Runtime:** Cloudflare Workers (TypeScript + Hono)
* **Database:** Cloudflare D1 (Native Serverless SQLite at the edge)
* **Static Dashboard:** Cloudflare Workers Static Assets (`./public`)
* **Security:** Web Crypto HMAC signed session cookies, constant-time comparisons, brute-force login rate limiting, secret token redaction in all logs.
* **Legal Documentation:** Static HTML pages served on GitHub Pages (`/docs/`).

---

## 🔑 Environment Variables & Secrets Reference

All production secrets are stored securely in Cloudflare's encrypted key-value store (never in git or code). For local testing, variables are stored in the gitignored `.dev.vars` file.

| Variable Name | Description | Where to Get It | Type |
| :--- | :--- | :--- | :--- |
| `META_APP_ID` | Your Meta Application ID | Meta for Developers Dashboard > App Settings > Basic | **Secret** |
| `META_APP_SECRET` | Your Meta App Secret (used to verify incoming webhook signatures via HMAC-SHA256) | Meta for Developers Dashboard > App Settings > Basic > App Secret | **Secret** |
| `META_VERIFY_TOKEN` | A secret random string you invent to verify your webhook URL with Meta | You invent this (e.g., `openssl rand -hex 24`) | **Secret** |
| `META_ACCESS_TOKEN` | Long-lived System User or User Access Token with `instagram_manage_comments` and `instagram_manage_messages` permissions | Meta Graph API Explorer or Meta Business Manager | **Secret** |
| `IG_BUSINESS_ACCOUNT_ID` | Numeric ID of your Instagram Professional / Creator account | Meta Graph API Explorer (`GET /me?fields=instagram_business_account`) | **Secret** |
| `ADMIN_PASSWORD` | Password to log into the web admin dashboard (minimum 12 characters) | You invent this (strong master password) | **Secret** |
| `SESSION_SECRET` | 32+ character random secret used to cryptographically sign session cookies | You invent this (e.g., `openssl rand -hex 32`) | **Secret** |
| `GRAPH_API_VERSION` | Version of Meta's Graph API to use (defaults to `v23.0`) | Meta Developer Docs / Release Notes (e.g., `v23.0`) | **Env Variable** |
| `DB` | Cloudflare D1 Database Binding name | Configured in `wrangler.jsonc` (`binding = "DB"`) | **D1 Binding** |
| `ASSETS` | Cloudflare Workers Static Assets Binding name | Configured in `wrangler.jsonc` (`binding = "ASSETS"`) | **Asset Binding** |

> ℹ️ *Backward-compatibility note:* The application also accepts legacy variable names (`IG_APP_ID`, `IG_APP_SECRET`, `IG_VERIFY_TOKEN`, `IG_USER_ID`, `IG_ACCESS_TOKEN`, `IG_API_VERSION`) automatically.

> 📱 **Need help getting your Meta tokens, App IDs, and setting up webhooks?** Follow our step-by-step **[Meta Developer Console Checklist](docs/META_SETUP_CHECKLIST.md)**.

---

## 🛠️ Configuring Secrets in Production

### Method 1: Using the Wrangler CLI (Recommended)

Run the following commands in your project directory. Wrangler will securely prompt you for each secret value:

```bash
# 1. Meta App ID
npx wrangler secret put META_APP_ID

# 2. Meta App Secret (for webhook signature verification)
npx wrangler secret put META_APP_SECRET

# 3. Webhook Verify Token (the secret string you enter in Meta console)
npx wrangler secret put META_VERIFY_TOKEN

# 4. Long-Lived Instagram Graph API Access Token
npx wrangler secret put META_ACCESS_TOKEN

# 5. Instagram Professional Account ID
npx wrangler secret put IG_BUSINESS_ACCOUNT_ID

# 6. Master Admin Dashboard Password
npx wrangler secret put ADMIN_PASSWORD

# 7. Session Cookie Signing Secret (32+ random characters)
npx wrangler secret put SESSION_SECRET
```

### Method 2: Via the Cloudflare Dashboard

If you prefer using the browser:
1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** in the left sidebar.
3. Select your Worker project: **reelrelay**.
4. Go to **Settings** > **Variables and Secrets**.
5. Click **Add** under *Secrets*, enter the Variable Name and Value, and click **Encrypt**.
6. Repeat for each secret listed above.

---

## 💻 Local Development Setup

### 1. Clone & Install
```bash
git clone https://github.com/SathtikBose/ReelRelay.git
cd ReelRelay
npm install
```

### 2. Configure Local Environment (`.dev.vars`)
Create your local secrets file from the example:
```bash
cp .dev.vars.example .dev.vars
```
Fill in your credentials in `.dev.vars`. *(`wrangler dev` automatically reads `.dev.vars` for local runs, and git automatically ignores it).*

### 3. Initialize Local D1 Database
Apply the SQLite migrations to your local development database:
```bash
npx wrangler d1 migrations apply DB --local
```

### 4. Run Locally
```bash
npm run dev
```
Open `http://localhost:8787/` in your browser. Log in with your `ADMIN_PASSWORD` to configure your reel rules!

### 5. Run Automated Tests
```bash
npm test
```

---

## 🚀 Cloudflare Deployment (CI/CD)

For comprehensive, beginner step-by-step instructions, see the **[Cloudflare Deployment Guide](docs/CLOUDFLARE_DEPLOY.md)**.

### Quick Deployment Checklist:
1. **Create Remote D1 Database:**
   ```bash
   npx wrangler d1 create reelrelay-db
   ```
   Paste the returned `database_id` into your [`wrangler.jsonc`](wrangler.jsonc).
2. **Apply Remote Migrations:**
   ```bash
   npx wrangler d1 migrations apply DB --remote
   ```
3. **Connect GitHub in Cloudflare Dashboard:**
   - Go to **Workers & Pages** > **Create application** > **Import a repository**.
   - Select `SathtikBose/ReelRelay`, set branch `main`, build command `npm run typecheck`, deploy command `npx wrangler deploy`.
4. **Add Secrets:**
   - Run `npx wrangler secret put <NAME>` for all 7 required secrets (or configure in Cloudflare Dashboard > Settings > Variables and Secrets).
5. **Auto-Deploy on Git Push:**
   - Every time you push to `main` (`git push origin main`), Cloudflare automatically builds, verifies types, and deploys your changes to edge servers worldwide in ~20 seconds.

---

## 🧪 Go-Live End-to-End Test Script

1. **Add a Rule:** In your dashboard (`https://reelrelay.<subdomain>.workers.dev/`), click **Add Rule**. Set Media ID to `*` (matches all reels) or your specific Reel ID, Keyword to `LINK`, DM Message to `Hey {username}! Here is your guide:`, Link to `https://example.com`, and click **Save**.
2. **Start Live Logs:** In your terminal, run `npx wrangler tail` to watch real-time events.
3. **Comment on Instagram:** From a test Instagram account (authorized tester if in Development Mode), post a comment on your reel: *"Send me the LINK!"*.
4. **Confirm DM:** Check your inbox on Instagram. The direct message will arrive within 2-3 seconds with the personalized message and link.
5. **Verify Logs:** Look at `wrangler tail` to see verified webhook receipt, keyword match, and successful private reply delivery.

*(For detailed testing steps and edge cases, see **[docs/GO_LIVE_AND_TROUBLESHOOTING.md](docs/GO_LIVE_AND_TROUBLESHOOTING.md)**).*

---

## 🩺 Troubleshooting Reference

| Issue | Root Cause | Fix |
| :--- | :--- | :--- |
| **Meta Webhook Verify Fails** | `META_VERIFY_TOKEN` mismatch | Verify token string matches in Cloudflare secrets and Meta console. |
| **403 Webhook Signature Error** | `META_APP_SECRET` incorrect | Copy exact App Secret from Meta App Settings > Basic and update secret. |
| **No DM Sent to Commenter** | App is in Development Mode without Tester role | Add commenter as an Instagram Tester in Meta App Roles, or submit for App Review. |
| **Stale Comment Error** | Comment older than 7 days | Meta Graph API policy window prohibits automated private replies to comments >7 days old. |
| **Duplicate DMs Blocked** | Idempotency working as intended | Cloudflare D1 deduplicates comment IDs using `INSERT OR IGNORE` to prevent spamming users. |
| **Session Expired OAuth Error** | Access token expired | Switch to a permanent System User Token with expiration "Never" per [Meta Setup Checklist](docs/META_SETUP_CHECKLIST.md). |

---

## 🗑️ Decommissioning Render & UptimeRobot

Now that your bot is running serverless on Cloudflare Workers, you can safely turn off your old hosting setup:

1. **Remove Render Service:**
   - Open [Render Dashboard](https://dashboard.render.com/) > Click your old ReelRelay service > **Settings** > Scroll to bottom > Click **Delete Web Service**.
2. **Remove UptimeRobot Monitor:**
   - Open [UptimeRobot](https://uptimerobot.com/dashboard) > Find your monitor > Click settings > Click **Delete**.
   - Cloudflare Workers never sleep and need no keep-alive pings.

---

## 📁 Repository Structure

```
ReelRelay/
├── docs/
│   ├── CLOUDFLARE_DEPLOY.md     # Cloudflare CI/CD & D1 step-by-step deploy guide
│   ├── META_SETUP_CHECKLIST.md  # Meta Developer Console & token generation checklist
│   ├── GO_LIVE_AND_TROUBLESHOOTING.md # Testing script, troubleshooting & cleanup
│   ├── privacy.html             # GitHub Pages: Privacy Policy (Meta App Review)
│   ├── terms.html               # GitHub Pages: Terms of Service
│   └── data-deletion.html       # GitHub Pages: User Data Deletion Instructions
├── migrations/
│   └── 0001_init.sql            # D1 SQLite schema (keywords, processed_comments, events_log)
├── public/
│   ├── index.html               # Mobile-responsive admin dashboard UI
│   ├── login.html               # Admin login screen
│   ├── css/style.css            # UI design system & responsive styling
│   └── js/admin.js              # Live DM template preview & interaction logic
├── src/
│   ├── index.ts                 # Worker entry point & route registration (Hono)
│   ├── lib/
│   │   ├── auth.ts              # Signed session cookies & login rate limiting
│   │   ├── crypto.ts            # Web Crypto HMAC-SHA256 & timing-safe equality
│   │   ├── db.ts                # D1 Database queries & atomic deduplication
│   │   └── logger.ts            # Structured logging with token sanitization
│   ├── routes/
│   │   ├── api.ts               # Authenticated keywords CRUD & activity API
│   │   └── webhook.ts           # Meta verification & event receiver (/webhook)
│   └── services/
│       ├── instagram.ts         # Meta Graph API DM sender & retry engine
│       ├── matcher.ts           # Case-insensitive Unicode keyword matcher
│       ├── normalizer.ts        # Webhook comment payload parser & filters
│       └── template.ts          # Personalized DM template generator
├── tests/                       # Vitest test suite (native in-memory SQLite)
├── wrangler.jsonc               # Cloudflare Worker & D1 binding configuration
├── .dev.vars.example            # Example local environment variables file
└── package.json
```

---

## 📄 License
MIT License.
