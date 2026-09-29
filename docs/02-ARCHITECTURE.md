# 02 — System Architecture

## 1. High-level diagram
```
 Viewer comments "LINK" on reel
              │
              ▼
        Instagram / Meta
              │  POST /webhook  (comments event, X-Hub-Signature-256)
              ▼
 ┌──────────────────────────────────────────────┐
 │ ReelRelay (Node.js + Express) — Render/local │
 │                                              │
 │  Webhook route ─► verify signature ─► 200 OK │
 │        │                                     │
 │        ▼  (async, after ack)                 │
 │  Event normalizer ─► filters (own/reply)     │
 │        │                                     │
 │        ▼                                     │
 │  Rule lookup (by mediaId) ─► Keyword matcher │
 │        │                                     │
 │        ▼                                     │
 │  Claim comment (unique commentId)            │
 │        │                                     │
 │        ▼                                     │
 │  Instagram client ─► POST /<IG_ID>/messages  │
 │        │           (recipient.comment_id)    │
 │        ▼                                     │
 │  Update ReplyLog (sent / failed / skipped)   │
 │                                              │
 │  Admin panel (EJS) ◄─► REST /admin routes    │
 │  Scheduler: daily token refresh check        │
 └──────────────┬───────────────────────────────┘
                │ Mongoose
                ▼
        MongoDB Atlas (M0)
 UptimeRobot ──► GET /health (every 5 min)
```

## 2. Components
| Component | Responsibility |
|-----------|----------------|
| `webhook` | Handshake (GET), signature check, raw-body parsing, fast 200 ack |
| `events` | Normalize Meta payload into `CommentEvent` objects; apply ignore filters |
| `matcher` | Pure function: does comment text match rule keywords/mode |
| `pipeline` | Orchestrates lookup → match → claim → send → log; retry policy |
| `instagram` | Only place that talks to `graph.instagram.com` (send DM, list media, refresh token) |
| `models` | Mongoose schemas: Reel, ReplyLog, Credential |
| `admin` | Auth, CSRF, CRUD, activity log, token screens (server-rendered EJS) |
| `scheduler` | Daily job: refresh token when close to expiry |
| `config` | Env validation (zod), constants |
| `lib` | logger (pino), crypto (AES-256-GCM), queue, errors |

## 3. Webhook processing rules
1. Read **raw body** (needed for HMAC). Verify `X-Hub-Signature-256` with app secret using timing-safe compare. Invalid → 401.
2. Respond `200` immediately.
3. For each `entry[].changes[]` where `field === "comments"`: normalize.
4. Drop if: commenter is the account owner, `parent_id` present (a reply), text empty.
5. Push to an in-process queue (concurrency 3). Worker runs the pipeline.
6. Pipeline is idempotent: a unique index on `commentId` makes the *claim* atomic.

## 4. Idempotency & retries
- Claim step: insert `ReplyLog{commentId, status:"processing"}`. Duplicate key → skip (already handled).
- Transient errors (network, 5xx, rate limit): retry up to 3 times with exponential backoff (1s, 4s, 15s).
- Permanent errors (invalid comment, outside 7-day window, permissions, bad token): no retry, store `errorCode`/`errorMessage`.
- Token errors (code 190): mark `failed`, raise admin banner, do not spin.

## 5. Folder structure
```
reelrelay/
├─ docs/                      # these files
├─ src/
│  ├─ server.js               # boot, db connect, graceful shutdown
│  ├─ app.js                  # express app factory (testable)
│  ├─ config/
│  │  └─ env.js               # zod-validated env
│  ├─ lib/
│  │  ├─ logger.js
│  │  ├─ crypto.js
│  │  ├─ queue.js
│  │  └─ errors.js
│  ├─ models/
│  │  ├─ Reel.js
│  │  ├─ ReplyLog.js
│  │  └─ Credential.js
│  ├─ services/
│  │  ├─ instagramClient.js
│  │  ├─ tokenService.js
│  │  ├─ ruleService.js
│  │  ├─ matcher.js
│  │  ├─ template.js
│  │  └─ pipeline.js
│  ├─ routes/
│  │  ├─ health.js
│  │  ├─ webhook.js
│  │  └─ admin/ (auth.js, reels.js, activity.js, settings.js)
│  ├─ middleware/ (auth.js, csrf.js, errorHandler.js, rawBody.js, requestId.js)
│  ├─ jobs/tokenRefresh.js
│  ├─ views/                  # EJS templates + partials
│  └─ public/                 # css, js
├─ scripts/ (seedRule.js, smoke.js)
├─ tests/ (unit/, integration/, fixtures/)
├─ .env.example
├─ .eslintrc.json  .prettierrc  jest.config.js
├─ render.yaml (Phase 8)
└─ package.json
```

## 6. Environments
| Env | Public URL | DB | Notes |
|-----|-----------|----|-------|
| local | Cloudflare Tunnel / ngrok | Atlas M0 (dev DB) or local | tunnel URL changes → update Meta webhook |
| test | none | mongodb-memory-server | mocked Instagram client |
| prod | Render free URL | Atlas M0 (prod DB) | UptimeRobot pings `/health` |

## 7. Key decisions
- **ADR-1 Server-rendered admin (EJS)**: one deployable, no separate frontend build, works on free tier.
- **ADR-2 In-process queue, no Redis**: single instance, free tier; idempotency in DB covers restarts.
- **ADR-3 Token in DB (encrypted)**: refreshed tokens cannot be written back to Render env vars at runtime.
- **ADR-4 Instagram API with Instagram Login** (`graph.instagram.com`): no Facebook Page required (**VERIFY** against current Meta docs).
