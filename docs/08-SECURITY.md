# 08 — Security Requirements

Mandatory. Each item has an owner phase; verify in Phase 7 hardening review.

## 1. Threats & mitigations
| Threat | Mitigation | Phase |
|--------|-----------|-------|
| Forged webhook requests | Verify `X-Hub-Signature-256` HMAC over raw body with `crypto.timingSafeEqual`; reject 401 | 3 |
| Webhook verify-token guessing | Long random `IG_VERIFY_TOKEN`; constant-time compare | 3 |
| Admin brute force | Single strong password from env, `express-rate-limit` on login (5 / 15 min / IP), generic error, timing-safe compare | 5 |
| Session theft | `cookie-session`: `httpOnly`, `secure` (prod), `sameSite=strict`, 8 h expiry, rotating secret via env | 5 |
| CSRF on admin actions | `csrf-csrf` token on every non-GET; reject otherwise | 5 |
| XSS via captions/comments/usernames | EJS escaping only; CSP `default-src 'self'`, no inline scripts; sanitize before render | 5, 7 |
| Malicious link injected in rule | Validate `https:` via `URL`; block `javascript:`, `data:`; max length | 2, 5 |
| NoSQL injection | zod validation with strict types; `express-mongo-sanitize`; never pass raw request objects to Mongoose queries | 5, 7 |
| Token leakage | Token encrypted at rest (AES-256-GCM, key in env); never logged; redact `authorization`, `access_token`, `password` in pino; error messages sanitized | 2, 4, 7 |
| Secrets in git | `.gitignore` `.env`; `.env.example` placeholders only; pre-commit secret scan optional | 1 |
| DM loops / self-reply | Ignore comments from `IG_USER_ID`; ignore replies (`parent_id`) | 3 |
| Duplicate/abusive DMs | Unique `commentId`; optional one DM per user per reel; concurrency-limited queue | 4 |
| Webhook flood / DoS | Rate limit `/webhook` generously (e.g. 300/min), body size limit 1 MB, fast ack | 7 |
| Dependency vulnerabilities | `npm audit` clean of high/critical; pinned lockfile | 7 |
| Info leakage in errors | Central error handler; generic messages in production; request ID for correlation | 7 |
| Clickjacking / sniffing | Helmet: `frame-ancestors 'none'`, `nosniff`, HSTS in prod | 7 |
| Open redirects | No user-controlled redirects | 5 |

## 2. Secrets handling
- Only `.env` (local) and Render environment variables (prod) hold secrets.
- Rotate `SESSION_SECRET`, `CSRF_SECRET` on suspicion of compromise (logs out admin).
- Rotating `ENCRYPTION_KEY` requires re-entering the Instagram token via `IG_ACCESS_TOKEN` bootstrap.
- Atlas: dedicated DB user with `readWrite` on `reelrelay` only; IP allowlist `0.0.0.0/0` is acceptable only because Render free has no static IP — strong password + TLS required.

## 3. Logging policy
- Log: request ID, route, status, latency, commentId, mediaId, status transitions, error codes.
- Do not log: tokens, passwords, secrets, full webhook bodies in production, full comment text beyond the stored 300-char snippet.

## 4. Privacy
- Store minimal commenter data (IGSID, username, snippet) for 60 days (TTL). Document this in the README.
- Provide a delete path: admin can purge logs for a username (Phase 7, optional).

## 5. Platform-policy compliance
- Only send DMs in response to a user's own comment (private reply). No unsolicited messaging.
- Keep DM content limited to what the reel promised. Avoid spammy repetition.
