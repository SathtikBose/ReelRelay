# YT-09 — Build Phases (YouTube Module)

**Rule:** one phase → `npm run lint` + `npm test` + boot check → commit → tag `yt-phase-N` → update status table → report → **wait for `next`**. See `/docs/AGENT-RULES.md` and `YT-AGENT-ADDENDUM.md`.

## Status table (agent updates)
| Phase | Name | Status | Commit | Tag |
|-------|------|--------|--------|-----|
| Y0 | Google setup (human) | ☐ | — | — |
| Y1 | Platform tab shell & route namespacing | ☑ | refactor(admin): introduce platform tabs and namespace Instagram routes | yt-phase-1 |
| Y2 | YouTube config, models & OAuth connect | ☑ | feat(youtube): add Google OAuth connection with encrypted credential storage | yt-phase-2 |
| Y3 | YouTube client, quota tracker, picker & rule CRUD | ☐ | | yt-phase-3 |
| Y4 | Polling engine & reply pipeline | ☐ | | yt-phase-4 |
| Y5 | Activity, dashboard, overview & ops | ☐ | | yt-phase-5 |
| Y6 | Hardening, docs & deployment update | ☐ | | yt-phase-6 |
| Y7 | Optional enhancements | ☐ | | — |

---

## Phase Y0 — Google setup (human)
Follow `YT-06-GOOGLE-SETUP.md` Steps 1–4: project, API enabled, consent screen, OAuth web client, test video, second Google account. The agent only confirms the human has `GOOGLE_CLIENT_ID/SECRET` before Phase Y2's manual step.

---

## Phase Y1 — Platform tab shell & route namespacing
**Goal:** tabbed admin with zero behaviour change for Instagram.
**Tasks**
- Read the existing admin routes/views/tests. Move Instagram routes to `/admin/instagram/*` (reels, activity, settings, `api/media`). Add redirects from every old path (302; query strings preserved).
- Add partials `tabs.ejs` and `subnav.ejs`; pass `platform` and `section` to views; active-state highlighting; mobile bottom bar per `YT-07-UI-UX.md`.
- Create the Overview page `/admin` (Instagram card live; YouTube card shows "Not connected / Coming soon" placeholder).
- Stub YouTube section: `/admin/youtube` renders "Not configured" or "Connect" placeholder page inside the shell.
- Update existing tests for new URLs; keep a test proving old URLs redirect.
**Acceptance**
- [ ] All existing Instagram tests green (updated paths only); manual click-through of every Instagram page works.
- [ ] Old bookmarks redirect correctly; CSRF/auth still enforced everywhere.
- [ ] Tabs are keyboard accessible, correct `aria-current`; 360 px layout fine.
**Tests:** redirects, nav active state, auth on new routes, overview renders, placeholder YouTube page.
**Commit:** `refactor(admin): introduce platform tabs and namespace Instagram routes`

---

## Phase Y2 — YouTube config, models & OAuth connect
**Goal:** connect a channel securely.
**Tasks**
- Extend env schema per `YT-03`: Google vars required only when `YT_ENABLED=true`; update `.env.example`.
- Models `YtVideoRule`, `YtReplyLog`, `YtCredential`, `YtState` per `YT-04` with indexes/TTL.
- `oauth.js` (state + PKCE, token exchange, refresh, revoke), `credentialService.js` (encrypt/decrypt refresh token, in-memory access token cache, status transitions), minimal `ytClient.getMyChannel()`.
- Routes: `oauth/start`, `oauth/callback`, `disconnect`; YouTube dashboard shows connected channel or Connect CTA.
**Acceptance**
- [ ] State mismatch/expired rejected; missing refresh token handled with clear message.
- [ ] Refresh token stored encrypted; nothing sensitive in logs.
- [ ] Disconnect revokes (mocked) and clears credential; app boots with YouTube disabled/unconfigured.
**Tests:** env conditional validation, models/indexes, OAuth start URL (params, PKCE), callback success/failure paths with mocked Google, refresh + `invalid_grant → needs_reauth`, disconnect.
**Manual (human):** connect the real channel (`YT-06` Step 5); confirm channel name appears.
**Commit:** `feat(youtube): add Google OAuth connection with encrypted credential storage`

---

## Phase Y3 — YouTube client, quota tracker, picker & rule CRUD
**Goal:** manage video rules from the YouTube tab.
**Tasks**
- `ytClient`: `listUploads`, `getVideos`, `listCommentThreads`, `insertReply`, error classification, 10 s timeouts, auto token refresh on 401 once.
- `quotaService`: Pacific-day key, `add(units)`, `remaining()`, soft-budget check, `quotaExceededUntil`.
- Rule CRUD routes + views per `YT-07` (list, new/edit with picker, toggle — resuming a paused rule resets `cursor.lastSeenAt` to now — delete), URL/ID parser (`watch?v=`, `youtu.be/`, `shorts/`), picker cache.
- `scripts/seedYtRule.js` CLI.
**Acceptance**
- [ ] Picker lists uploads from mocked API and caches; manual-ID fallback works.
- [ ] Validation: non-https link, bad video ID, empty keywords/variants, duplicate rule → clear errors.
- [ ] Quota day rolls over at Pacific midnight (tested with fake timers incl. DST dates).
**Tests:** client (success, 401 refresh, quota, 5xx), quota service, CRUD + validation, parser cases, XSS escaping of titles, auth/CSRF.
**Commit:** `feat(youtube): add YouTube client, quota tracking and video rule management`

---

## Phase Y4 — Polling engine & reply pipeline
**Goal:** real end-to-end auto-replies.
**Tasks**
- `normalizer`, `pipeline`, `poller`, `scheduler` per `YT-02`: lock, due-rule selection, adaptive intervals, cursor logic (first poll = now unless backfill; max 5 pages), oldest-first processing.
- Filters: own channel, empty text, replies; reuse shared `matcher` and `template`; pick a random reply variant; sanitize `{{author}}`.
- Claim via unique `commentId`; one reply per author per video (default); hourly cap; random jitter delay; quota check before each insert.
- Error handling: transient retries, `quotaExceeded` → deferral + `quotaExceededUntil`, `invalid_grant` → `needs_reauth`, `commentsDisabled` → pause rule.
- `scripts/pollOnce.js`; scheduler starts in `server.js` only when enabled, connected and not in test mode; graceful shutdown stops it.
**Acceptance**
- [ ] New rule + old comments: no replies (cursor starts at now). Backfill on: replies to last-7-days comments only.
- [ ] Same comment seen twice → one reply. Overlapping cycles → one runs, one skips.
- [ ] Quota exhausted mid-cycle → remaining become `deferred`, none lost; next day they are processed first.
- [ ] Restart between cycles loses nothing.
**Tests:** cursor/pagination fixtures, first-poll behaviour, matcher integration, own-comment filter, variants, hourly cap + jitter (fake timers), quota deferral, `invalid_grant`, lock, duplicate prevention, concurrency.
**Manual (human):** comment from second Google account → reply appears under it; verify visibility while logged out.
**Commit:** `feat(youtube): add polling engine and keyword auto-reply pipeline`

---

## Phase Y5 — Activity, dashboard, overview & ops
**Goal:** operate it with confidence.
**Tasks**
- YouTube Activity (filters, pagination, Retry for failed/deferred < 7 days, link to the comment).
- YouTube Dashboard: stats, quota meter, last poll summary, banners, **Poll now**.
- Settings: channel, reconnect/disconnect, quota/polling info, **purge YouTube logs**.
- Overview page: real YouTube card + combined recent activity with platform badges. Status dots on tabs.
**Acceptance**
- [ ] Retry works once and updates status; blocked for comments ≥ 7 days old.
- [ ] Banners appear for needs_reauth, quota reached, comments disabled.
- [ ] Stats equal DB counts; Overview shows both platforms correctly.
**Tests:** retry rules, stats aggregation, banner logic, purge, overview with each connection state.
**Commit:** `feat(youtube): add activity log, dashboard, quota meter and combined overview`

---

## Phase Y6 — Hardening, docs & deployment update
**Goal:** production-ready.
**Tasks**
- Walk `YT-08-SECURITY.md`; fix gaps. CSP `img-src` additions, rate limits on new POST routes, log-redaction audit for Google values.
- `npm audit`, coverage ≥ 80% on `src/youtube`, matcher/quota 100% branches.
- Update root README (YouTube section, tabs screenshot placeholders, env table, limitations: public replies, quota, spam filter, token expiry), `.env.example`, Render env var list, smoke script (`/health`, `/admin/login`, optional YouTube config check).
- Follow `YT-10-DEPLOYMENT.md`: add production redirect URI in Google console, set env vars on Render, deploy, connect the channel in production, live E2E.
**Acceptance**
- [ ] Security checklist ticked; no high/critical audit findings.
- [ ] Production: connect, rule, second-account comment → reply posted.
- [ ] Instagram production flow still works after the deploy.
**Commit:** `chore(youtube): harden module, update docs and deployment configuration` → tag `v1.1.0` as well as `yt-phase-6`.

---

## Phase Y7 — Optional (only on request)
- Reply-to-replies support; per-rule hourly cap; Shorts-only auto-rule template ("apply default keyword to every new upload"); CSV export; heart/like via API where allowed (**VERIFY**); multi-language keyword lists; notification (Telegram/email) on `needs_reauth` or quota reached.
