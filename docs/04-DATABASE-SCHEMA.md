# 04 — Database Schema (MongoDB / Mongoose)

Database name: `reelrelay`. Three collections.

## 1. `reels` (rules)
One document per reel rule.

| Field | Type | Notes |
|-------|------|-------|
| `_id` | ObjectId | |
| `mediaId` | String | **Unique.** Instagram media ID of the reel |
| `permalink` | String | Reel URL (from picker) |
| `caption` | String | First 120 chars, display only |
| `thumbnailUrl` | String | Display only (may expire) |
| `keywords` | [String] | 1–10 items, stored lowercase, trimmed, 1–30 chars |
| `matchMode` | String | `word` (default), `exact`, `contains` |
| `link` | String | Must be `https://`; max 2000 chars |
| `dmTemplate` | String | Max 800 chars. Variables: `{{link}}`, `{{username}}`, `{{keyword}}` |
| `active` | Boolean | Default true |
| `stats.matched` | Number | Comments that matched |
| `stats.sent` | Number | DMs sent |
| `stats.failed` | Number | DMs failed |
| `createdAt`, `updatedAt` | Date | Timestamps |

Indexes: `{ mediaId: 1 }` unique; `{ active: 1 }`.

Default `dmTemplate`: `Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}`

## 2. `replylogs` (idempotency + activity)
| Field | Type | Notes |
|-------|------|-------|
| `commentId` | String | **Unique.** Idempotency key |
| `mediaId` | String | |
| `reelId` | ObjectId | Ref to `reels`, nullable |
| `commenterId` | String | Instagram-scoped ID |
| `commenterUsername` | String | |
| `commentText` | String | Truncated to 300 chars |
| `matchedKeyword` | String | |
| `status` | String | `processing`, `sent`, `failed`, `skipped` |
| `skipReason` | String | `no_rule`, `inactive`, `no_match`, `duplicate_user`, `own_comment`, `reply_comment` |
| `attempts` | Number | |
| `errorCode` | String | Meta error code/subcode if any |
| `errorMessage` | String | Sanitized, no tokens |
| `messageId` | String | Returned by Meta on success |
| `commentedAt` | Date | From webhook `time` |
| `processedAt` | Date | |
| `createdAt` | Date | **TTL index** (see below) |

Indexes:
- `{ commentId: 1 }` unique
- `{ mediaId: 1, commenterId: 1, status: 1 }` (per-user-per-reel dedupe check)
- `{ status: 1, createdAt: -1 }` (activity filters)
- `{ createdAt: 1 }` with `expireAfterSeconds = LOG_TTL_DAYS * 86400` (keeps Atlas under 512 MB)

Note: do not log `skipped/no_rule` and `no_match` for every comment on busy posts unless `LOG_SKIPPED=true`; count them instead. (Reduces storage.)

## 3. `credentials` (singleton)
Stores the Instagram token encrypted so it can be refreshed at runtime.

| Field | Type | Notes |
|-------|------|-------|
| `key` | String | Always `"instagram"`. Unique |
| `igUserId` | String | |
| `tokenCipher` | String | AES-256-GCM ciphertext (base64) |
| `tokenIv` | String | Base64 |
| `tokenTag` | String | Base64 auth tag |
| `expiresAt` | Date | Now + `expires_in` at last refresh |
| `lastRefreshedAt` | Date | |
| `lastRefreshStatus` | String | `ok` / `error` |
| `lastRefreshError` | String | Sanitized |

On first boot, if no credential exists and `IG_ACCESS_TOKEN` is set, encrypt and store it. After that the DB copy is the source of truth.

## 4. Validation rules (enforced in Mongoose + zod)
- `link`: parsed with `new URL()`, protocol must be `https:`.
- `keywords`: unique within a rule, no empty strings, no whitespace-only.
- `mediaId`: digits only.
- Reject any object keys beginning with `$` (sanitizer + schema `strict`).

## 5. Sizing estimate
~600 bytes per log document. 60-day TTL at ~500 logged events/day ≈ 18 MB. Comfortably inside 512 MB.
