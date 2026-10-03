# YT-05 — API Specification (YouTube Module)

## Part A — Internal routes (all require admin session; non-GET require CSRF)

### Shell
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Overview: Instagram + YouTube summary cards |
| GET | `/admin/reels...`, `/admin/activity`, `/admin/settings` | **Redirect** (302 → 301 once stable) to `/admin/instagram/...` |

### YouTube
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/youtube` | Dashboard: connection state, quota meter, stats, recent activity |
| GET | `/admin/youtube/oauth/start` | Create `state` + PKCE verifier (session), redirect to Google |
| GET | `/admin/youtube/oauth/callback` | Validate `state`, exchange `code`, store credential, redirect to dashboard |
| POST | `/admin/youtube/disconnect` | Revoke token, set `disconnected`, stop polling |
| GET | `/admin/youtube/videos` | List rules |
| GET | `/admin/youtube/videos/new` | New rule form + picker |
| POST | `/admin/youtube/videos` | Create rule |
| GET | `/admin/youtube/videos/:id/edit` | Edit form |
| POST | `/admin/youtube/videos/:id` | Update rule |
| POST | `/admin/youtube/videos/:id/toggle` | Pause/resume |
| POST | `/admin/youtube/videos/:id/delete` | Delete rule |
| GET | `/admin/youtube/api/videos` | JSON picker (cached `YT_PICKER_CACHE_SEC`) |
| GET | `/admin/youtube/activity` | Log with filters `status`, `videoId`, `page` |
| POST | `/admin/youtube/activity/:id/retry` | Retry `failed`/`deferred` (comment younger than 7 days) |
| GET | `/admin/youtube/settings` | Channel info, quota, poll settings, reconnect/disconnect |
| POST | `/admin/youtube/poll-now` | Run one poll cycle immediately (respects lock + quota) |

Error format for JSON routes matches Instagram: `{ "error": { "code", "message", "details" } }`. If the module is disabled/not configured, YouTube routes render a "Not configured" page with 200 (not a crash).

## Part B — OAuth flow
1. `GET oauth/start`: generate `state` (32 random bytes) and PKCE `code_verifier`; store in session with 10-min expiry. Redirect to:
```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=<GOOGLE_CLIENT_ID>
  &redirect_uri=<GOOGLE_REDIRECT_URI>
  &response_type=code
  &scope=https://www.googleapis.com/auth/youtube.force-ssl
  &access_type=offline
  &prompt=consent
  &state=<state>
  &code_challenge=<S256 challenge>&code_challenge_method=S256
```
2. `GET oauth/callback?code&state`: reject if `state` mismatch/expired or `error` param present. Exchange:
```
POST https://oauth2.googleapis.com/token
grant_type=authorization_code&code=...&client_id=...&client_secret=...
&redirect_uri=...&code_verifier=...
```
3. Require a `refresh_token` in the response (else show "Revoke app access in your Google account and reconnect"). Verify the granted scope includes `youtube.force-ssl`.
4. Call `channels.list?part=snippet,contentDetails&mine=true`. If no channel → friendly error. Store channel + encrypted refresh token, status `connected`.
5. Refresh: `POST /token` with `grant_type=refresh_token`. `invalid_grant` → status `needs_reauth`.

## Part C — YouTube calls (only via `ytClient.js`; 10 s timeout; `Authorization: Bearer`)

### Picker
```
GET /channels?part=contentDetails&mine=true                      → uploads playlist ID
GET /playlistItems?part=snippet,contentDetails&playlistId=<ID>&maxResults=25[&pageToken=]
GET /videos?part=snippet,contentDetails&id=<id1,id2,...>          → duration (Shorts heuristic ≤ 3 min & vertical hint), thumbnails
```
Short detection is a heuristic (duration only); treat as display badge, never as logic.

### Poll
```
GET /commentThreads?part=snippet&videoId=<ID>&order=time&maxResults=50&textFormat=plainText[&pageToken=]
```
Use from each item: `id` (thread id = top-level comment id), `snippet.topLevelComment.snippet.{textDisplay|textOriginal, authorDisplayName, authorChannelId.value, publishedAt}`. Disabled comments → error `commentsDisabled` → pause rule with banner.

Optional optimization (**VERIFY** support/behaviour): `allThreadsRelatedToChannelId=<channelId>` returns threads across the channel in one call. Do not depend on it in v1.

### Reply
```
POST /comments?part=snippet
{ "snippet": { "parentId": "<TOP_LEVEL_COMMENT_ID>", "textOriginal": "<REPLY TEXT>" } }
```
Success returns the new comment resource (`id`).

## Part D — Quota table (estimate; **VERIFY** in Google's quota calculator)
| Operation | Units |
|-----------|-------|
| commentThreads.list | 1 |
| playlistItems.list / channels.list / videos.list | 1 each |
| comments.insert | 50 |
| Daily default | 10,000 |

Example: 5 active videos, polled every 5 min = 1,440 units/day → ~170 replies/day. Adaptive polling lowers this for older videos.

## Part E — Error classification
| Situation | Class | Action |
|-----------|-------|--------|
| Network error, timeout, HTTP 5xx, `backendError` | transient | retry 1 s / 4 s / 15 s |
| `quotaExceeded` / `dailyLimitExceeded` | quota | set `quotaExceededUntil` = next Pacific midnight; mark remaining `deferred`; banner |
| `rateLimitExceeded` | transient | longer backoff |
| 401 / `invalid_grant` / token revoked | auth | `needs_reauth`, stop polling, banner |
| 403 `forbidden` on insert | permanent | mark failed with hint (permissions/channel) |
| `commentsDisabled` | permanent (rule) | pause rule + banner |
| `commentNotFound` / `processingFailure` on parent | permanent | mark failed |
| Anything else 4xx | permanent | mark failed, sanitized message |
