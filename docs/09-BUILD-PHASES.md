# 09 — Build Phases

**Rule:** build one phase → `npm run lint` + `npm test` + boot check → commit → tag → update status table → report → **wait for `next`**. See `AGENT-RULES.md`.

## Status table (agent updates after each phase)
| Phase | Name | Status | Commit | Tag |
|-------|------|--------|--------|-----|
| 0 | Prerequisites (human) | ☐ | — | — |
| 1 | Scaffold & tooling | ☑ | 1850fa5 | phase-1 |
| 2 | Database layer & crypto | ☐ | | phase-2 |
| 3 | Webhook receiver | ☐ | | phase-3 |
| 4 | Matching & reply pipeline | ☐ | | phase-4 |
| 5 | Admin auth & reel rules | ☐ | | phase-5 |
| 6 | Activity, stats & token lifecycle | ☐ | | phase-6 |
| 7 | Hardening & polish | ☐ | | phase-7 |
| 8 | Deployment & live E2E | ☐ | | phase-8 |
| 9 | Optional enhancements | ☐ | | — |

---

## Phase 0 — Prerequisites (human, manual)
Follow `06-META-SETUP.md` checklist: Professional IG account, Meta app, token, Atlas cluster, tunnel tool, second test account. Agent only confirms the human has the `.env` values before Phase 3's manual steps.

---

## Phase 1 — Scaffold & tooling
**Goal:** runnable, tested, linted Express skeleton.
**Tasks**
- `git init`, `main` branch, `.gitignore`, `.nvmrc`, `.editorconfig`.
- `package.json` with scripts from `03-TECH-STACK.md`, `engines.node >=20`.
- Folder structure from `02-ARCHITECTURE.md` (empty modules where later phases fill in).
- `src/config/env.js`: zod schema for all env vars; fail fast with a clear message; test-mode defaults.
- `src/lib/logger.js` (pino with redaction), `src/lib/errors.js` (AppError classes).
- `src/app.js` (factory) + `src/server.js` (listen, graceful shutdown on SIGTERM).
- `GET /health` returning status, uptime, version, db state (`"unknown"` until Phase 2).
- ESLint (+ security plugin), Prettier, Jest config, `.env.example`, root `README.md` (setup + scripts).
**Acceptance**
- [ ] `npm run lint` and `npm test` pass; `npm run dev` boots; `/health` returns 200.
- [ ] Missing required env → process exits with readable error (tested).
**Tests:** health route (supertest), env validation (valid / missing / malformed).
**Commit:** `chore: scaffold Express service with config validation, logging and tooling`

---

## Phase 2 — Database layer & crypto
**Goal:** persistent models with correct indexes; encrypted token storage.
**Tasks**
- Mongoose connection with retry/backoff and connection events; `/health` reports DB state.
- Models `Reel`, `ReplyLog`, `Credential` exactly per `04-DATABASE-SCHEMA.md` incl. validators and TTL index.
- `src/lib/crypto.js`: AES-256-GCM `encrypt/decrypt` with random IV.
- `tokenService` (bootstrap from `IG_ACCESS_TOKEN`, get/set token, expiry tracking) — no Instagram calls yet.
- `scripts/seedRule.js` skeleton (implemented fully in Phase 4).
**Acceptance**
- [ ] Unique indexes enforced (duplicate `mediaId`, duplicate `commentId` rejected).
- [ ] Non-https link rejected; keywords normalized.
- [ ] Encrypt → decrypt roundtrip; tamper detection throws.
**Tests:** `mongodb-memory-server` model tests, crypto tests, tokenService bootstrap test.
**Commit:** `feat(db): add MongoDB models, indexes and token encryption utilities`

---

## Phase 3 — Webhook receiver
**Goal:** secure endpoint that Meta can verify and deliver comment events to.
**Tasks**
- `GET /webhook` handshake; `POST /webhook` with raw-body capture and HMAC verification (timing-safe).
- zod schema for payload; normalizer to `CommentEvent[]`; filters (own comment, `parent_id`, empty text).
- Fast 200 ack; hand normalized events to a stub `pipeline.enqueue()` that only logs (real work in Phase 4).
- `p-queue` wrapper in `lib/queue.js` (concurrency 3).
**Acceptance**
- [ ] Valid signature → 200 and event logged; invalid/missing → 401; wrong verify token → 403.
- [ ] Own-comment and reply events ignored.
- [ ] Malformed payload does not crash the server.
**Tests:** signature valid/invalid/missing/tampered, handshake, normalizer fixtures (comment, reply, own, malformed).
**Manual (human):** run tunnel, complete `06-META-SETUP.md` Step 5, press Verify in Meta dashboard, comment from second account, confirm log line appears. Resolve the **VERIFY** items about dev-mode delivery and permissions and report findings.
**Commit:** `feat(webhook): add verified Instagram comment webhook endpoint`

---

## Phase 4 — Matching & reply pipeline
**Goal:** real end-to-end DM sending (rules seeded via CLI).
**Tasks**
- `matcher.js`: normalize (NFKC, lowercase, trim, strip surrounding punctuation/emoji noise); modes `word`, `exact`, `contains`; returns matched keyword or null.
- `template.js`: render `{{link}}`, `{{username}}`, `{{keyword}}`; enforce max length; escape nothing (plain text) but strip control characters.
- `instagramClient.sendPrivateReply()` with 10 s timeout, error classification per `05-API-SPEC.md`.
- `pipeline.js`: lookup rule → inactive/no rule → skip → match → per-user-per-reel check → **claim** (`ReplyLog` insert, unique) → send with retry/backoff → update log + rule stats.
- `scripts/seedRule.js`: `npm run seed:rule -- --media <id> --keyword LINK --link https://example.com`.
- Optional flag `LOG_SKIPPED` behaviour per schema doc.
**Acceptance**
- [ ] Same comment delivered twice → exactly one send.
- [ ] Transient 5xx retried then succeeds; permanent error not retried; 190 flagged as auth failure.
- [ ] Two reels with different keywords/links never cross over.
**Tests:** matcher matrix (case, punctuation, emoji, substring traps like `linkedin` vs `link`, multiple keywords, exact mode), template tests, client tests with mocked fetch, pipeline integration tests with in-memory Mongo.
**Manual (human):** seed a rule for a real reel, comment the keyword from the second account, confirm DM arrives (Inbox or Requests).
**Commit:** `feat(pipeline): match keywords and send private replies with idempotency and retries`

---

## Phase 5 — Admin auth & reel rules
**Goal:** manage rules from the browser.
**Tasks**
- Login/logout, `cookie-session`, auth middleware, CSRF, login rate limit.
- Reel rule CRUD routes + EJS views per `07-UI-UX.md` (list, new, edit, toggle, delete with confirm).
- Reel picker via `GET /admin/api/media` (Instagram `/me/media`), manual media-ID fallback.
- Server-side zod validation; friendly inline errors; flash messages.
- Layout, design tokens, responsive nav, dark mode.
**Acceptance**
- [ ] All `/admin/*` require auth; unauthenticated → redirect to login (HTML) / 401 (JSON).
- [ ] CSRF failure rejected; login lockout after 5 attempts.
- [ ] Rule created in UI triggers real DMs (manual check).
- [ ] User-supplied strings are escaped (XSS test).
**Tests:** auth flow, CSRF, CRUD + validation, duplicate media rule, picker with mocked Instagram, XSS escaping.
**Commit:** `feat(admin): add authenticated admin panel for managing reel keyword rules`

---

## Phase 6 — Activity, stats & token lifecycle
**Goal:** operate the tool with confidence.
**Tasks**
- Dashboard stat cards and alert banners; Activity page with filters, pagination, retry button (< 7 days).
- Token refresh: `instagramClient.refreshToken()`, `tokenService.refreshIfNeeded()` (refresh when < 15 days left), `node-cron` daily job at a fixed time + run-on-boot check, manual refresh button and a "Replace token" form in Settings (encrypts and stores a newly generated token).
- Settings page (token status, webhook URL, app info).
**Acceptance**
- [ ] Failed log row can be retried once and updates status.
- [ ] Token near expiry gets refreshed and persisted encrypted; failure surfaces a banner.
- [ ] Stats match DB counts.
**Tests:** stats aggregation, retry logic (window check), refresh success/failure with mocked API, scheduler unit test with fake timers.
**Commit:** `feat(ops): add activity log, dashboard stats and automatic token refresh`

---

## Phase 7 — Hardening & polish
**Goal:** production-ready quality.
**Tasks**
- Helmet + CSP, `express-mongo-sanitize`, webhook rate limit, body size limits, central error handler, request IDs, log redaction audit.
- Graceful shutdown (drain queue, close DB), unhandled rejection handling.
- `npm audit` fixes, dependency review, README finalization (setup, env, troubleshooting, privacy note).
- UI polish pass: empty states, loading states, 360 px layout, keyboard/focus check.
- Security checklist in `08-SECURITY.md` walked through; note any deviations.
**Acceptance**
- [ ] Security headers present; errors don't leak internals; NoSQL-injection payloads rejected.
- [ ] No high/critical `npm audit` findings.
- [ ] Coverage ≥ 80% on `services/` and `routes/`.
**Tests:** header tests, error handler tests, injection tests, shutdown test.
**Commit:** `chore(security): harden HTTP layer, error handling and logging`

---

## Phase 8 — Deployment & live E2E
**Goal:** running for free 24/7.
**Tasks**
- `render.yaml` (optional) / documented Render settings, health check path `/health`, env vars list.
- `scripts/smoke.js`: checks `/health`, webhook handshake (with verify token), signature rejection.
- Follow `10-DEPLOYMENT.md`: Atlas prod DB, Render service, UptimeRobot monitor, update Meta webhook URL.
- Live E2E on a real reel with the second account; record results.
**Acceptance**
- [ ] `npm run smoke -- https://<render-url>` passes.
- [ ] Real comment → DM in production.
- [ ] UptimeRobot shows "Up" and service does not sleep.
**Commit:** `chore(deploy): add Render deployment config and smoke test script`  → tag `v1.0.0` too.

---

## Phase 9 — Optional enhancements (only on request)
- Public reply "Check your DMs 📩" (needs comment permission).
- CSV export of activity log; purge-by-username privacy tool.
- Multiple DM message variants per rule (random pick).
- Simple weekly summary email/Telegram notification (free tier).
