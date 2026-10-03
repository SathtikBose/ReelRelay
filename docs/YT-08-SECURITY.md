# YT-08 — Security Requirements (YouTube Module)

All requirements in `/docs/08-SECURITY.md` still apply. Additional items below are mandatory.

| Threat | Mitigation | Phase |
|--------|-----------|-------|
| OAuth CSRF / code injection | Random `state` stored in session, 10-min expiry, compared in constant time; reject on mismatch | Y2 |
| Authorization code interception | PKCE (S256); `code_verifier` kept server-side in session only | Y2 |
| Refresh token theft | Encrypted at rest (AES-256-GCM via shared `crypto`), never logged, never rendered; access token in memory only | Y2 |
| Over-broad access | Request only `youtube.force-ssl`; show requested permission on the connect screen; **Disconnect** revokes token at Google and deletes the credential | Y2 |
| Leaking client secret | Env only; redacted in logs; not in client JS | Y1–Y2 |
| Unauthenticated OAuth routes | `/oauth/start` and `/oauth/callback` require an admin session | Y2 |
| Reply loops / self-replies | Ignore comments whose `authorChannelId` equals the connected channel; only top-level comments | Y4 |
| Duplicate replies | Unique `commentId` claim; poll lock; idempotent retries | Y4 |
| Spam-flagging / account penalties | Reply variants, hourly cap (`YT_MAX_REPLIES_PER_HOUR`), random delay, no repeated reply to the same author on the same video (default on) | Y4 |
| Quota exhaustion (self-DoS) | Soft budget, quota tracker per Pacific day, adaptive polling, deferral instead of hammering | Y3–Y4 |
| Malicious link in rule | `https:` only, `URL` parse, max length; reject `javascript:`/`data:` | Y3 |
| Malicious comment content | Treat as untrusted text: strip control characters, never render unescaped, never interpolate into queries; truncate stored text to 300 chars | Y4 |
| Reply text injection of unexpected mentions | Template variables are plain text only; `{{author}}` sanitized (strip `@`, newlines, URLs) | Y4 |
| NoSQL injection on new routes | zod validation, `express-mongo-sanitize`, no raw request objects in queries | Y3 |
| CSRF on admin actions | Existing CSRF middleware on every new POST | Y1–Y5 |
| XSS from YouTube titles/comments | EJS escaping only; CSP unchanged except `img-src` additions for YouTube thumbnails | Y3, Y6 |
| Clickjacking | Existing helmet `frame-ancestors 'none'` | Y6 |
| Dependency risk | No new packages; `npm audit` re-run in Y6 | Y6 |
| Info leakage | Sanitized Google error messages; no tokens/codes in logs; central error handler | Y2–Y6 |

## Logging policy
Log: request ID, route, status, rule ID, video ID, comment ID, status transitions, Google error reasons (e.g. `quotaExceeded`), quota counters.
Never log: client secret, auth code, access/refresh tokens, `code_verifier`, full comment bodies beyond the stored 300-char snippet.

## Platform-policy compliance
- Only reply to comments that contain the creator's own advertised keyword. No unsolicited comments.
- Keep replies short and relevant. Do not mass-post identical text; do not exceed reasonable hourly volume.
- Respect YouTube API Services Terms and Developer Policies (**VERIFY**) — in particular, data retention: purge stored comment data after the TTL and on disconnect (offer "purge YouTube logs" in Settings).

## Privacy
Stored per reply: author channel ID, display name, 300-char snippet, 60-day TTL. Document this in the README. On **Disconnect**, offer to delete all `yt_reply_logs`.
