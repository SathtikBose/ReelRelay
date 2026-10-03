# YT-04 — Database Schema (YouTube Module)

New collections, prefixed `yt_`, in the same database. Instagram collections are untouched.

## 1. `yt_video_rules`
| Field | Type | Notes |
|-------|------|-------|
| `videoId` | String | **Unique.** 11-char YouTube video ID |
| `title` | String | Display |
| `thumbnailUrl` | String | Display |
| `publishedAt` | Date | Video publish time (drives adaptive polling) |
| `isShort` | Boolean | Display badge (heuristic) |
| `keywords` | [String] | 1–10, lowercase, trimmed, 1–30 chars |
| `matchMode` | String | `word` (default), `exact`, `contains` |
| `link` | String | `https://` only, ≤ 2000 chars |
| `replyVariants` | [String] | 1–5 items, each ≤ 500 chars. Variables: `{{link}}`, `{{author}}`, `{{keyword}}` |
| `active` | Boolean | Default true |
| `backfill` | Boolean | Default false. If true, first poll also handles existing comments (last 7 days) |
| `cursor.lastSeenAt` | Date | Newest processed comment `publishedAt` |
| `cursor.lastPolledAt` | Date | |
| `cursor.nextPollAt` | Date | Scheduler uses this |
| `stats.matched/replied/failed` | Number | |
| `createdAt`, `updatedAt` | Date | |

Indexes: `{videoId:1}` unique; `{active:1, 'cursor.nextPollAt':1}`.

Default variants:
1. `Here you go 👉 {{link}}`
2. `Thanks for commenting! Link: {{link}}`
3. `Sharing the link as promised: {{link}}`

## 2. `yt_reply_logs`
| Field | Type | Notes |
|-------|------|-------|
| `commentId` | String | **Unique.** Top-level comment ID (idempotency key) |
| `videoId` | String | |
| `ruleId` | ObjectId | Ref `yt_video_rules` |
| `authorChannelId` | String | |
| `authorName` | String | Display name |
| `commentText` | String | Truncated to 300 chars |
| `matchedKeyword` | String | |
| `status` | String | `processing`, `posted`, `failed`, `skipped`, `deferred` |
| `skipReason` | String | `own_comment`, `no_match`, `hourly_cap`, `inactive` |
| `replyText` | String | What was posted |
| `replyCommentId` | String | Returned by YouTube |
| `attempts` | Number | |
| `errorCode` | String | e.g. `quotaExceeded`, `commentsDisabled`, `forbidden` |
| `errorMessage` | String | Sanitized |
| `quotaCost` | Number | Estimated units consumed |
| `commentedAt` | Date | Comment publish time |
| `processedAt` | Date | |
| `createdAt` | Date | **TTL** = `LOG_TTL_DAYS` |

Indexes: `{commentId:1}` unique; `{status:1, createdAt:-1}`; `{videoId:1, createdAt:-1}`; `{status:1, processedAt:1}` (hourly cap + deferred queue); TTL on `createdAt`.

Do not log `no_match` comments individually; count them in rule stats (storage control).

## 3. `yt_credentials` (singleton)
| Field | Type | Notes |
|-------|------|-------|
| `key` | String | Always `"youtube"`, unique |
| `channelId` | String | |
| `channelTitle` | String | |
| `uploadsPlaylistId` | String | Cached from `channels.list` |
| `refreshCipher/refreshIv/refreshTag` | String | AES-256-GCM (reuse `lib/crypto.js`) |
| `scopes` | [String] | Granted scopes |
| `status` | String | `connected`, `needs_reauth`, `disconnected` |
| `connectedAt`, `lastRefreshedAt` | Date | |
| `lastError` | String | Sanitized |

Access tokens are **not stored**; they live in an in-memory cache with expiry.

## 4. `yt_state` (singleton)
| Field | Type | Notes |
|-------|------|-------|
| `key` | String | Always `"youtube"` |
| `quotaDayKey` | String | `YYYY-MM-DD` in America/Los_Angeles |
| `quotaUsed` | Number | Estimated units used that day |
| `quotaExceededUntil` | Date | Set on `quotaExceeded`; next Pacific midnight |
| `lockUntil` | Date | Poller lock |
| `lastPollAt` | Date | |
| `lastPollStatus` | String | `ok`, `error`, `skipped` |
| `lastPollSummary` | Object | `{rules, comments, replies, errors}` |

## 5. Validation
- `videoId`: `/^[A-Za-z0-9_-]{11}$/`.
- `link`: parsed with `new URL()`, protocol `https:` only.
- `replyVariants`: strip control characters; reject empty; each must include `{{link}}` or the rule's link must otherwise appear (warn in UI, do not block).
- Reject keys starting with `$`.

## 6. Sizing
Log docs ≈ 700 bytes. 60-day TTL at ~200 logged replies/day ≈ 8 MB. Safe for Atlas M0.
