# YT-02 — Architecture (YouTube Module)

## 1. Flow
```
 Scheduler tick (every YT_POLL_BASE_INTERVAL_SEC)
        │  acquire poll lock (yt_state)
        ▼
 For each due, active rule (video)
        │  quota guard (soft budget)
        ▼
 commentThreads.list (newest first, 1 unit/page)
        │  stop when reaching cursor.lastSeenAt
        ▼
 Normalize ► filter (own channel, empty) ► shared matcher
        │
        ▼
 Claim comment (yt_reply_logs.commentId unique)
        │  hourly cap + random delay
        ▼
 comments.insert (50 units) ► update log, stats, quota
        │
        ▼
 Advance cursor, schedule nextPollAt, release lock
```
No webhook, no public URL needed for YouTube. OAuth callback is an admin page.

## 2. Components (new, under `src/youtube/`)
| Module | Responsibility |
|--------|----------------|
| `config.js` | YT-specific env parsing (extends `config/env.js`) |
| `oauth.js` | Build auth URL (state + PKCE), exchange code, refresh access token, revoke |
| `credentialService.js` | Store/load encrypted refresh token, in-memory access token cache, status (`connected`/`needs_reauth`/`disconnected`) |
| `ytClient.js` | **Only** module calling Google/YouTube HTTP APIs; timeouts; error classification |
| `quotaService.js` | Track estimated units per Pacific-time day, soft budget, `quotaExceededUntil` |
| `ruleService.js` | CRUD + due-rule selection |
| `normalizer.js` | `commentThreads` item → `YtCommentEvent` |
| `pipeline.js` | claim → throttle → reply → log (reuses shared `matcher`, `template`) |
| `poller.js` | Lock, cycle, cursor logic, adaptive intervals |
| `scheduler.js` | Starts/stops the interval; `pollNow()` |

Shared (existing, reused): `matcher`, `template`, `crypto`, `queue`, `logger`, `errors`, auth/CSRF/error middleware, layout partials.

## 3. Admin shell: tab navigation
Top-level tabs: **Overview · Instagram · YouTube**. Each platform has sub-nav: **Dashboard · Rules · Activity · Settings**.

Route namespacing (old paths redirect with 301/302 so bookmarks keep working):
| Old | New |
|-----|-----|
| `/admin` | `/admin` (Overview: both platforms' summary cards) |
| `/admin/reels...` | `/admin/instagram/reels...` |
| `/admin/activity` | `/admin/instagram/activity` |
| `/admin/settings` | `/admin/instagram/settings` |
| — | `/admin/youtube/...` (new) |

`/admin/api/media` becomes `/admin/instagram/api/media`. Keep `/webhook`, `/health`, `/admin/login`, `/admin/logout` unchanged. A `platform` value is passed to views so the layout highlights the active tab and renders the right sub-nav. The last used platform is remembered in a cookie for the default landing tab (optional).

## 4. Poller design
1. **Tick**: `setInterval` (or `node-cron`) every `YT_POLL_BASE_INTERVAL_SEC` (default 300 s). Skips if disabled, not connected, or `quotaExceededUntil` in the future.
2. **Lock**: atomic `findOneAndUpdate` on `yt_state` (`lockUntil < now` → set `lockUntil = now + 4 min`). Prevents overlap and double-poll during redeploys.
3. **Due rules**: active rules where `cursor.nextPollAt <= now`. Adaptive interval per rule: video age < 48 h → 2–5 min; < 7 days → 15 min; older → 60 min (configurable constants).
4. **Cursor logic**: fetch pages newest-first (max 5 pages/rule/cycle). Stop at the first comment with `publishedAt <= cursor.lastSeenAt`. Process collected comments oldest-first. New `lastSeenAt` = newest `publishedAt` seen. First poll of a rule sets `lastSeenAt = now` unless `backfill` is on. When a paused rule is resumed, reset `lastSeenAt = now` so comments posted while paused are never replied to.
5. **Per-reply guard**: hourly cap (count of `posted` in last hour), random delay `YT_REPLY_DELAY_MIN_MS..MAX_MS`, quota check before each insert.
6. **Failure handling**: transient → retry with backoff (1 s, 4 s, 15 s); `quotaExceeded` → set `quotaExceededUntil` to next Pacific midnight, mark remaining as `deferred`; `invalid_grant` → credential `needs_reauth`, stop polling, show banner.
7. **Deferred replies**: on the next quota day, deferred comments newer than 7 days are replied to first (oldest first) before new ones.

## 4a. Pacific-time quota day
Quota resets at midnight Pacific Time. Compute the day key with `Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles'})`. Never use server-local midnight.

## 5. Folder structure additions
```
src/
├─ youtube/
│  ├─ config.js  oauth.js  credentialService.js  ytClient.js
│  ├─ quotaService.js  ruleService.js  normalizer.js
│  ├─ pipeline.js  poller.js  scheduler.js
│  └─ models/ (YtVideoRule.js, YtReplyLog.js, YtCredential.js, YtState.js)
├─ routes/admin/
│  ├─ instagram/ (moved: reels.js, activity.js, settings.js)
│  ├─ youtube/   (dashboard.js, videos.js, activity.js, settings.js, oauth.js)
│  └─ overview.js
├─ views/
│  ├─ partials/ (tabs.ejs, subnav.ejs)
│  ├─ instagram/ (moved views)
│  └─ youtube/
scripts/seedYtRule.js
tests/youtube/ (unit/, integration/, fixtures/)
```

## 6. Decisions
- **ADR-Y1 Polling over push:** YouTube offers no comment webhook. Cursor + unique index gives at-least-once discovery and exactly-once replies.
- **ADR-Y2 Separate `yt_` collections:** zero risk to Instagram data; independent TTL and indexes.
- **ADR-Y3 Native `fetch` for Google:** no SDK; small surface, easy mocking.
- **ADR-Y4 Refresh token only in DB (encrypted):** access tokens are short-lived and cached in memory.
- **ADR-Y5 Top-level comments only (v1):** keeps quota and spam risk low.
