# ReelRelay ⚡

> High-reliability, free-tier automation platform for **Instagram** (comment-to-DM) and **YouTube** (comment-to-reply) built with Node.js, Express, and MongoDB Atlas.

---

## Overview

ReelRelay automates viewer engagement across social media channels:
1. **Instagram**: Listens to real-time comment webhooks on your Reels, matches configured keywords (e.g. `LINK`, `GUIDE`, `PDF`), and automatically sends the viewer a tailored private direct message (DM) containing your link and customized text within seconds.
2. **YouTube**: Polls your YouTube videos and Shorts using an adaptive schedule, detects keywords in viewer comments, and posts automated public replies with randomized text variants, anti-spam delay jitter, and automated quota budgeting.

---

## Key Features

### 📸 Instagram Module
- 🚀 **Real-Time Webhook Pipeline**: Sub-second webhook acknowledgement with asynchronous queued reply processing via `p-queue`.
- 🛡️ **Zero-Downtime Token Refresh**: Automatic token validity tracking and daily automated background refresh before token expiry.
- 🔄 **Meta Policy 7-Day Retry**: Integrated retry mechanisms for transient errors adhering strictly to Meta's 7-day private reply window.

### ▶️ YouTube Module
- ⏱️ **Adaptive Polling Engine**: Dynamic polling intervals tailored to video age (<48h: 3 min, <7d: 15 min, $\ge$7d: 60 min) with atomic distributed locking.
- 🎲 **Multi-Variant Reply Templates**: Randomized reply variants to maintain authentic engagement and avoid duplicate message flags (`{{link}}`, `{{author}}`, `{{keyword}}`).
- 📊 **Quota Meter & Soft Budgeting**: Built-in tracking of the 10,000 daily YouTube Data API units, resetting automatically at midnight Pacific Time with automatic deferral safeguards.
- 🛡️ **Anti-Spam & Rate Limiting**: Channel hourly caps, randomized delay jitter, and automatic duplicate commenter suppression per video.
- 🔐 **OAuth 2.0 with PKCE**: Secure Google authorization with RFC 7636 Proof Key for Code Exchange and AES-256-GCM encrypted refresh token storage.

### 🌐 Unified Platform Shell
- 🖥️ **Tabbed Admin Dashboard**: Multi-platform interface (Overview, Instagram, YouTube) with live health indicators.
- 🔒 **Enterprise-Grade Hardening**: AES-256-GCM encryption at rest, Helmet Content Security Policy, CSRF protection, NoSQL injection sanitization, and structured Pino logs with automatic secret redaction.
- 🆓 **100% Free Tier Stack**: Designed specifically to run 24/7 on free-tier infrastructure (Render web service + MongoDB Atlas M0).

---

## System Architecture

```
                                  [ ReelRelay Platform ]
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼                                                         ▼
    [ Instagram Module ]                                      [ YouTube Module ]
               │                                                         │
  (POST /webhook from Meta)                                  (Background Polling Engine)
               │                                                         │
    [ HMAC Verification ]                                      [ Distributed Lock ]
               │                                                         │
      [ In-Memory Queue ]                                       [ Adaptive Poller ]
               │                                                         │
      [ Matcher Service ]                                       [ Keyword Matcher ]
               │                                                         │
   [ Graph API: Private DM ]                                 [ YouTube API: Reply Insert ]
               │                                                         │
  [ Viewer Receives Direct DM ]                             [ Reply Appears Under Comment ]
```

---

## Prerequisites

- **Node.js**: `>= 20.0.0 LTS`
- **npm**: `>= 9.0.0`
- **MongoDB Atlas**: Free M0 cluster (or local MongoDB `>= 6.0`)
- **Meta Developer Account**: Instagram Business / Creator account (see [`docs/06-META-SETUP.md`](docs/06-META-SETUP.md))
- **Google Cloud Console**: Google OAuth 2.0 Web Client credentials (see [`docs/YT-06-GOOGLE-SETUP.md`](docs/YT-06-GOOGLE-SETUP.md))

---

## Quick Start

### 1. Installation
```bash
git clone https://github.com/your-org/reelrelay.git
cd reelrelay
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your settings:
```bash
cp .env.example .env
```

| Variable | Description | Required | Example / Default |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP port | No | `3000` |
| `NODE_ENV` | Environment mode | No | `development` |
| `BASE_URL` | Public application URL | Yes | `https://reelrelay.onrender.com` |
| `MONGODB_URI` | MongoDB Atlas connection URI | Yes | `mongodb+srv://...` |
| `ADMIN_PASSWORD` | Password for admin dashboard ($\ge 12$ chars) | Yes | `StrongPassphrase!2026` |
| `SESSION_SECRET` | Secret key for signed cookie session ($\ge 32$ chars) | Yes | `random_session_secret_32_bytes_min` |
| `CSRF_SECRET` | Secret key for CSRF token generation ($\ge 32$ chars) | Yes | `random_csrf_secret_32_bytes_min` |
| `ENCRYPTION_KEY` | 64-hex char AES-256-GCM master key | Yes | `64_hex_chars_e.g._openssl_rand_-hex_32` |
| **Instagram Settings** | | | |
| `IG_APP_ID` | Meta App ID | Yes (for IG) | `123456789012345` |
| `IG_APP_SECRET` | Meta App Secret for webhook HMAC | Yes (for IG) | `abcdef0123456789...` |
| `IG_VERIFY_TOKEN` | Secret token for webhook handshake | Yes (for IG) | `random_long_verify_token` |
| `IG_USER_ID` | Instagram Business Account ID | Yes (for IG) | `17841400000000000` |
| `IG_ACCESS_TOKEN` | Long-lived Instagram User Access Token | Yes (for IG) | `EAA...` |
| **YouTube Settings** | | | |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | Yes (for YT) | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | Yes (for YT) | `GOCSPX-xxx` |
| `YT_ENABLED` | Enable YouTube module | No | `true` |
| `YT_POLL_ENABLED` | Enable background poller scheduler | No | `true` |
| `YT_POLL_BASE_INTERVAL_SEC` | Base polling cycle interval in seconds | No | `300` (5 mins) |
| `YT_QUOTA_DAILY_BUDGET` | Daily quota soft budget (units) | No | `9000` |
| `YT_MAX_REPLIES_PER_HOUR` | Max automated replies per hour | No | `60` |
| `YT_REPLY_DELAY_MIN_MS` | Minimum randomized delay before reply (ms) | No | `3000` |
| `YT_REPLY_DELAY_MAX_MS` | Maximum randomized delay before reply (ms) | No | `10000` |
| `YT_PICKER_CACHE_SEC` | Video picker cache TTL in seconds | No | `600` |

> 💡 **Tip:** Generate strong secrets with `openssl rand -hex 32`.

### 3. Running Locally
```bash
# Start development server
npm run dev

# Run test suite
npm test

# Run linter
npm run lint

# Trigger a one-shot YouTube polling cycle manually
npm run poll:yt
```

---

## Admin Panel Features

Access the web panel at `http://localhost:3000/admin`:

### 🌐 Platform Overview (`/admin`)
- Combined platform status cards showing DMs sent, YouTube replies posted, active rules, and token/quota health.
- Unified recent activity stream with platform indicator badges (`📸 Instagram` / `▶️ YouTube`).

### 📸 Instagram Section (`/admin/instagram/*`)
- **Dashboard (`/admin/instagram/dashboard`)**: DMs sent today/7d, failure metrics, active rules, and token expiration countdown.
- **Reels Rules (`/admin/instagram/reels`)**: Create, edit, toggle, and delete Reel keyword triggers with recent Reel picker.
- **Activity Log (`/admin/instagram/activity`)**: Searchable, paginated audit log with 1-click retry for failures within 7 days.
- **Settings (`/admin/instagram/settings`)**: Token validity, manual token refresh, token replacement, and webhook endpoints.

### ▶️ YouTube Section (`/admin/youtube/*`)
- **Dashboard (`/admin/youtube`)**: Real-time quota progress meter, poller status, reply counters, and **⚡ Poll Now** button.
- **Videos Rules (`/admin/youtube/videos`)**: Create, edit, and toggle video keyword rules with video picker (supporting regular uploads and Shorts), keyword chips, match modes (`contains`, `word`, `exact`), and randomized reply variants.
- **Activity Log (`/admin/youtube/activity`)**: Filterable comment log with direct YouTube comment links and retry actions for items $< 7\text{ days old}$.
- **Settings (`/admin/youtube/settings`)**: Channel connection management, quota details, polling schedule breakdown, and automated log purge tool.

---

## Security Architecture

- **Encrypted Credentials at Rest**: Instagram access tokens and Google refresh tokens are stored in MongoDB using authenticated **AES-256-GCM** encryption with unique IVs. Plaintext tokens are never logged.
- **PKCE & State Verification**: Google OAuth utilizes RFC 7636 Proof Key for Code Exchange (`code_challenge` / `code_verifier`) and cryptographic session state to prevent interception or CSRF attacks.
- **Timing-Safe HMAC Verification**: Meta webhook signatures use `crypto.timingSafeEqual` over raw request buffers.
- **Content Security Policy**: Hardened Helmet CSP with strict source origins, framing restrictions (`frame-ancestors 'none'`), and image whitelists for Instagram and YouTube CDN domains.
- **NoSQL Injection Sanitization**: Incoming request payloads and query parameters are sanitized via `express-mongo-sanitize`.
- **Automatic Secret Redaction**: Sensitive authorization headers, tokens, and client secrets are scrubbed before logging.

---

## Operational Troubleshooting

| Issue | Platform | Cause | Solution |
| :--- | :--- | :--- | :--- |
| **Webhook 403 Handshake** | Instagram | `IG_VERIFY_TOKEN` mismatch | Verify `IG_VERIFY_TOKEN` in `.env` matches Meta App Dashboard. |
| **Webhook 401 Signature** | Instagram | `IG_APP_SECRET` incorrect | Check `IG_APP_SECRET` in `.env`. Webhook HMAC requires raw body capture. |
| **Token Expired (Code 190)** | Instagram | 60-day token expired | Go to `/admin/instagram/settings` and click "Refresh Token" or replace with a fresh token. |
| **Banner: Reconnect YouTube** | YouTube | Refresh token revoked/expired | Go to `/admin/youtube/settings` and click "Reconnect Channel". |
| **Quota Budget Reached** | YouTube | 10,000 daily units exhausted | Normal safety behavior. Remaining replies become `deferred` and resume automatically at midnight Pacific Time. |
| **Rule Paused (commentsDisabled)** | YouTube | Comments disabled on video | Re-enable comments in YouTube Studio and reactivate the rule in `/admin/youtube/videos`. |
| **Replies Held for Review** | YouTube | Automated link review by YouTube | Check YouTube Studio $\rightarrow$ Comments $\rightarrow$ "Held for review". Try shorter URLs or test with a second account. |
| **Comment Retry Expired** | Both | Comment older than 7 days | Platform policy restricts automated interactions on comments $\ge 7$ days old. |

---

## Privacy & Data Retention

- **Minimal Data Footprint**: Only stores public commenter identifiers (username / author channel ID) and truncated comment text ($\le 300$ characters) necessary for deduplication and delivery verification.
- **Automated Purge TTL**: All comment reply logs have an automatic **60-day MongoDB TTL index** (`LOG_TTL_DAYS`) that permanently deletes expired records.
- **Manual Data Purge**: Admins can immediately purge historical logs from the Settings tab at any time.

---

## License

MIT License. Free for personal and commercial automation.
