# YT-03 — Tech Stack (YouTube Module)

Everything from `/docs/03-TECH-STACK.md` still applies. The YouTube module adds **no new runtime dependencies** by default.

## 1. APIs and endpoints
| Purpose | Endpoint |
|---------|----------|
| OAuth authorize | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token exchange / refresh | `https://oauth2.googleapis.com/token` |
| Token revoke | `https://oauth2.googleapis.com/revoke` |
| YouTube Data API v3 | `https://www.googleapis.com/youtube/v3/` |

Required OAuth scope: `https://www.googleapis.com/auth/youtube.force-ssl` (needed to post replies). **VERIFY** against current docs.

## 2. YouTube methods used
| Method | Use | Approx. cost (**VERIFY**) |
|--------|-----|------|
| `channels.list` (`mine=true`) | Identify connected channel, find uploads playlist | 1 |
| `playlistItems.list` (uploads playlist) | Video picker (videos + Shorts) | 1 |
| `videos.list` | Titles/thumbnails/duration details | 1 |
| `commentThreads.list` | Poll comments per video | 1 per page |
| `comments.insert` | Post the reply | 50 |

## 3. New environment variables
| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | for YouTube | — | OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | for YouTube | — | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | no | `${BASE_URL}/admin/youtube/oauth/callback` | Must exactly match Google Cloud console |
| `YT_ENABLED` | no | `true` | Master switch for the YouTube module |
| `YT_POLL_ENABLED` | no | `true` | Turn polling on/off (e.g. in tests) |
| `YT_POLL_BASE_INTERVAL_SEC` | no | `300` | Scheduler tick |
| `YT_QUOTA_DAILY_BUDGET` | no | `9000` | Soft budget (units) below the 10,000 default |
| `YT_MAX_REPLIES_PER_HOUR` | no | `60` | Hard cap on replies |
| `YT_REPLY_DELAY_MIN_MS` | no | `3000` | Min jitter between replies |
| `YT_REPLY_DELAY_MAX_MS` | no | `10000` | Max jitter between replies |
| `YT_PICKER_CACHE_SEC` | no | `600` | Cache of video picker results |

Reused: `ENCRYPTION_KEY`, `SESSION_SECRET`, `CSRF_SECRET`, `BASE_URL`, `MONGODB_URI`, `LOG_LEVEL`, `LOG_TTL_DAYS`.

If `YT_ENABLED=false` or Google variables are missing, the YouTube tab shows a "Not configured" page and the app still boots (Instagram unaffected). The zod schema must make Google vars **conditionally required** only when `YT_ENABLED=true`.

## 4. New npm scripts
```
seed:yt-rule   node scripts/seedYtRule.js
poll:yt        node scripts/pollOnce.js     # runs one poll cycle (dev/debug)
```

## 5. Testing additions
Same Jest + supertest + `mongodb-memory-server`. Google endpoints mocked via fetch mock (no network). Fake timers for scheduler, jitter and quota-day logic.
