# 05 — API Specification

## Part A — Internal routes

### Public
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | none | `{status:"ok", uptime, db:"connected"\|"disconnected", version}` — 200 if process up. Must be fast (no Instagram calls). |
| GET | `/webhook` | verify token | Meta handshake |
| POST | `/webhook` | HMAC signature | Comment events |

### `GET /webhook`
Query: `hub.mode`, `hub.verify_token`, `hub.challenge`.
- If `hub.mode === "subscribe"` and token equals `IG_VERIFY_TOKEN` → `200` with body = `hub.challenge` (plain text).
- Otherwise `403`.

### `POST /webhook`
Header: `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(raw body, `IG_APP_SECRET`).
- Missing/invalid signature → `401`, nothing processed.
- Valid → `200 {"received":true}` immediately, process asynchronously.

Expected payload (comments field):
```json
{
  "object": "instagram",
  "entry": [{
    "id": "<IG_USER_ID>",
    "time": 1760000000,
    "changes": [{
      "field": "comments",
      "value": {
        "id": "<COMMENT_ID>",
        "text": "link please",
        "from": { "id": "<IGSID>", "username": "someuser" },
        "media": { "id": "<MEDIA_ID>", "media_product_type": "REELS" },
        "parent_id": "<PARENT_COMMENT_ID>"   // only when it is a reply
      }
    }]
  }]
}
```
Normalized internal shape:
```js
{ commentId, mediaId, text, commenterId, commenterUsername, parentId|null, receivedAt }
```
Treat every field as untrusted; validate with zod. Unknown shapes are logged at `warn` and ignored (still 200).

### Admin (session cookie required, CSRF on non-GET)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/login` | Login page |
| POST | `/admin/login` | Body `{password}`; rate-limited (5/15 min/IP) |
| POST | `/admin/logout` | End session |
| GET | `/admin` | Dashboard |
| GET | `/admin/reels` | List rules |
| GET | `/admin/reels/new` | New rule form with reel picker |
| POST | `/admin/reels` | Create rule |
| GET | `/admin/reels/:id/edit` | Edit form |
| POST | `/admin/reels/:id` | Update rule |
| POST | `/admin/reels/:id/toggle` | Activate/pause |
| POST | `/admin/reels/:id/delete` | Delete rule |
| GET | `/admin/api/media` | JSON list of recent reels from Instagram (picker) |
| GET | `/admin/activity` | Log with filters `status`, `mediaId`, `page` |
| POST | `/admin/activity/:id/retry` | Retry failed DM if < 7 days old |
| GET | `/admin/settings` | Token status, webhook info |
| POST | `/admin/settings/refresh-token` | Manual token refresh |
| POST | `/admin/settings/replace-token` | Body `{token}`; validates, encrypts and stores a new token |

Error format (JSON routes): `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }` with proper HTTP status. HTML routes render a friendly error page. Never leak stack traces in production.

## Part B — Instagram API calls (all via `src/services/instagramClient.js`)

Base: `https://graph.instagram.com` (+ `/${IG_API_VERSION}` when set). **VERIFY** current version and paths in Meta docs before Phase 4.

### 1. Send private reply
```
POST /<IG_USER_ID>/messages
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{ "recipient": { "comment_id": "<COMMENT_ID>" },
  "message":   { "text": "<DM TEXT>" } }
```
Success: `{ "recipient_id": "...", "message_id": "..." }`.
Rules: one message per comment, within 7 days of the comment.

### 2. List recent media (reel picker)
```
GET /me/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp&limit=25
```
Filter to `media_product_type === "REELS"` (fall back to `VIDEO` if needed). Support cursor pagination via `paging.cursors.after`.

### 3. Refresh long-lived token
```
GET /refresh_access_token?grant_type=ig_refresh_token&access_token=<TOKEN>
```
Returns `{ access_token, token_type, expires_in }`. Token must be valid and at least 24 h old. Refresh when < 15 days remain.

### 4. Subscribe account to webhooks (one-time, manual or scripted)
```
POST /<IG_USER_ID>/subscribed_apps?subscribed_fields=comments
Authorization: Bearer <ACCESS_TOKEN>
```

### 5. Optional (Phase 9): public reply
```
POST /<COMMENT_ID>/replies   { "message": "Check your DMs 📩" }
```
Needs comment-management permission.

## Part C — Error classification
| Situation | Class | Action |
|-----------|-------|--------|
| Network error / timeout / HTTP 5xx | transient | retry (1s, 4s, 15s) |
| Rate limit / throttling codes | transient | retry with longer backoff |
| Code 190 (invalid/expired token) | auth | mark failed, show banner, no retry |
| Comment older than 7 days / invalid comment ID | permanent | mark failed with reason |
| Permission errors (10, 200-299) | permanent | mark failed, show hint |
| Anything else 4xx | permanent | mark failed with sanitized message |

Timeout for every Instagram request: 10 s via `AbortController`.
