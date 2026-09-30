# ReelRelay ⚡

> High-reliability, free-tier Instagram comment-to-DM automation tool built with Node.js, Express, and MongoDB Atlas.

---

## Overview

ReelRelay listens to real-time Instagram comment webhooks on your Reels, matches configured keywords (e.g. `LINK`, `GUIDE`, `PDF`), and automatically sends the viewer a tailored private direct message (DM) containing your link and customized text within seconds.

### Key Features
- 🚀 **Real-Time Webhook Pipeline**: Sub-second webhook acknowledgement with asynchronous queued reply processing via `p-queue`.
- 🛡️ **Zero-Downtime Token Refresh**: Automatic token validity tracking and daily automated background refresh before token expiry.
- 🔒 **Enterprise-Grade Security**: AES-256-GCM encrypted token storage at rest, timing-safe webhook HMAC verification, CSRF double-submit protection, Helmet CSP, and rate limiting.
- 📱 **Responsive Mobile-First Admin Panel**: Clean, modern dark-mode admin panel to manage Reel keyword rules, live template preview, recent reel picker, and operational activity logs.
- 🔄 **Instagram Policy 7-Day Retry**: Integrated retry mechanisms for transient errors adhering strictly to Meta's 7-day private reply window.
- 🆓 **100% Free Tier Stack**: Designed specifically to run 24/7 on free-tier infrastructure (Render web service + MongoDB Atlas M0).

---

## System Architecture

```
[ Instagram Viewer ] --(Comment)--> [ Meta Graph Webhook ]
                                            │
                                            ▼ (POST /webhook)
                                    [ ReelRelay Service ]
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
      [ HMAC Verification ]       [ 200 OK Ack (<1s) ]         [ In-Memory Queue ]
                                                                         │
                                                                         ▼
                                                                [ Matcher Service ]
                                                                         │
                                                                         ▼
                                                                [ Instagram API Client ]
                                                                         │
                                                                         ▼ (Private Reply DM)
                                                               [ Viewer Direct Message ]
```

---

## Prerequisites

- **Node.js**: `>= 20.0.0 LTS`
- **npm**: `>= 9.0.0`
- **MongoDB Atlas**: Free M0 cluster (or local MongoDB `>= 6.0`)
- **Meta Developer Account**: Instagram Business / Creator account connected to a Facebook Page (see [`docs/06-META-SETUP.md`](docs/06-META-SETUP.md))

---

## Quick Start

### 1. Installation
```bash
git clone https://github.com/your-org/reelrelay.git
cd reelrelay
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and provide your secrets:
```bash
cp .env.example .env
```

| Variable | Description | Required | Example / Default |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP port | No | `3000` |
| `NODE_ENV` | Environment mode | No | `development` |
| `BASE_URL` | Public application URL | Yes | `https://reelrelay.onrender.com` |
| `MONGODB_URI` | MongoDB Atlas connection URI | Yes | `mongodb+srv://...` |
| `IG_APP_ID` | Meta App ID | Yes | `123456789012345` |
| `IG_APP_SECRET` | Meta App Secret for webhook HMAC | Yes | `abcdef0123456789...` |
| `IG_VERIFY_TOKEN` | Secret token for webhook handshake | Yes | `random_long_verify_token` |
| `IG_USER_ID` | Instagram Business Account ID | Yes | `17841400000000000` |
| `IG_ACCESS_TOKEN` | Long-lived Instagram User Access Token | Yes | `EAA...` |
| `ADMIN_PASSWORD` | Password for admin dashboard ($\ge 12$ chars) | Yes | `StrongPassphrase!2026` |
| `SESSION_SECRET` | Secret key for signed cookie session ($\ge 32$ chars) | Yes | `random_session_secret_32_bytes_min` |
| `CSRF_SECRET` | Secret key for CSRF token generation ($\ge 32$ chars) | Yes | `random_csrf_secret_32_bytes_min` |
| `ENCRYPTION_KEY` | 64-hex char AES-256-GCM master key | Yes | `64_hex_chars_e.g._openssl_rand_-hex_32` |
| `LOG_LEVEL` | Logging level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) | No | `info` |

> 💡 **Tip:** Generate strong secrets using `openssl rand -hex 32`.

### 3. Running Locally
```bash
# Start in development mode with nodemon
npm run dev

# Run test suite
npm test

# Run linter
npm run lint
```

---

## Admin Panel Features

Access the admin panel at `http://localhost:3000/admin`:
- **Dashboard (`/admin`)**: Real-time KPI cards for DMs sent today, 7-day volume, failure alerts, active rule counters, and proactive token expiry warnings ($\le 10\text{ days}$).
- **Reel Rules (`/admin/reels`)**: Create, update, toggle, and delete keyword automation rules. Includes a dynamic Reel Picker fetching recent posts directly from Instagram.
- **Activity Log (`/admin/activity`)**: Search and filter comment events by status and Reel. Re-try transient failures with a single click within the 7-day policy window.
- **Settings (`/admin/settings`)**: Inspect token validity, execute manual token refreshes, replace tokens, and view webhook endpoints.

---

## Security Architecture

- **Token Encryption at Rest**: Access tokens stored in MongoDB are encrypted using AES-256-GCM with unique initialization vectors and authentication tags.
- **Constant-Time Verification**: Webhook HMAC signatures and password digests use `crypto.timingSafeEqual` to prevent timing attacks.
- **CSRF & Rate Limiting**: All mutation forms enforce double-submit CSRF tokens. Authentication and webhook endpoints are protected with strict IP rate limiters.
- **HTTP Hardening**: Helmet with strict Content Security Policy (`CSP`), HSTS, `frame-ancestors 'none'`, and NoSQL injection sanitization (`express-mongo-sanitize`).
- **Data Redaction**: Sensitive authorization headers, access tokens, and passwords are automatically scrubbed from structured Pino logs.

---

## Troubleshooting Guide

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Meta Webhook Handshake 403** | `IG_VERIFY_TOKEN` mismatch | Verify `IG_VERIFY_TOKEN` in `.env` matches the token entered in the Meta App Dashboard exactly. |
| **Webhook 401 Invalid Signature** | `IG_APP_SECRET` incorrect or raw body altered | Ensure `IG_APP_SECRET` is accurate. Webhook payload is captured raw before parsing to compute valid HMAC. |
| **Instagram API Code 190** | Access token expired or invalid permissions | Go to `/admin/settings` and click "Refresh Token" or paste a new token from Meta Graph API Explorer. |
| **DM Not Sending on Comment** | Keyword mismatch or rule inactive | Verify rule status is active, check keyword match mode (`word`, `exact`, `contains`), and ensure the commenter is not the account owner. |
| **Comment Retry Blocked** | Comment is older than 7 days | Meta's Platform Policy strictly restricts private replies to comments within 7 days. Retries beyond 7 days are rejected by policy. |

---

## Privacy & Data Retention

ReelRelay adheres to minimal data retention practices:
- **Comment Data**: Only store the commenter's Instagram Scoped ID (IGSID), username, and truncated comment text (max 300 characters) solely for deduplication and delivery audit.
- **Automatic Expiration**: All activity logs in MongoDB have an automatic **60-day TTL index** (`LOG_TTL_DAYS`) that purges records permanently.

---

## License
MIT License. Free for personal and commercial automation.
