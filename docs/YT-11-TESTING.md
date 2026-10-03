# YT-11 — Testing Strategy (YouTube Module)

Rules from `/docs/11-TESTING.md` apply: deterministic tests, no real network, no real credentials. Google/YouTube HTTP is mocked. Fake timers for scheduler, jitter, backoff and quota-day logic.

## 1. Levels
| Level | Scope |
|-------|-------|
| Unit | quota day key, URL/ID parser, normalizer, template/author sanitizer, error classification, PKCE helpers |
| Integration | OAuth routes, rule CRUD, poller + pipeline with in-memory MongoDB and mocked `ytClient`/fetch |
| Contract | fixtures in `tests/youtube/fixtures/` for `commentThreads.list`, `comments.insert`, `channels.list`, token responses, error bodies |
| Regression | the full existing Instagram suite must pass unchanged (except updated URLs) |
| Manual E2E | real channel + second Google account |

## 2. Shell / navigation (Y1)
- Each old Instagram URL redirects to the new one (status, `Location`, query preserved).
- Unauthenticated access to every new route → blocked.
- Active tab and sub-nav highlighted correctly per route; `aria-current` set.
- Overview renders with YouTube disabled, not connected, connected.

## 3. OAuth (Y2)
| Case | Expected |
|------|----------|
| Valid callback | credential stored encrypted, status `connected` |
| Wrong/missing/expired `state` | rejected, nothing stored |
| `error=access_denied` | friendly message |
| Token response without `refresh_token` | clear "revoke and reconnect" message |
| Refresh returns `invalid_grant` | status `needs_reauth`, poller stops |
| Disconnect | revoke called, credential removed, polling stopped |
| `YT_ENABLED=false` / missing Google vars | app boots, YouTube page says "Not configured" |

## 4. Rules & picker (Y3)
- Video ID parsing: `watch?v=ID`, `youtu.be/ID`, `shorts/ID`, raw ID, garbage → error.
- Validation: non-https link, 0 or >10 keywords, >5 variants, >500-char variant, duplicate videoId.
- Picker: caching, pagination, API failure → manual fallback message.
- Quota: day key at Pacific midnight, including DST changes (March/November) and server timezone ≠ Pacific.

## 5. Poller & pipeline (Y4)
| Case | Expected |
|------|----------|
| First poll of new rule | cursor set to now, no replies |
| Backfill on | replies only to comments ≤ 7 days old |
| New comments across 2 pages | all processed oldest-first, cursor advanced once |
| Cursor reached on page 1 | no extra page fetched |
| Own channel's comment | skipped |
| Keyword matrix (shared matcher) | same results as Instagram matrix |
| Same comment in two cycles | one reply |
| Two overlapping cycles | one runs, other skips (lock) |
| Same author twice on same video | second skipped (default) |
| Hourly cap reached | remaining `skipped/hourly_cap` or deferred; resumes next hour |
| Jitter | delay within `[min,max]` (fake timers) |
| Transient 5xx twice then OK | `posted`, `attempts=3` |
| `quotaExceeded` mid-cycle | current + remaining `deferred`, `quotaExceededUntil` set; next day processed first |
| `commentsDisabled` | rule paused + banner flag |
| Restart mid-cycle | no loss, no duplicate |
| Comment text with HTML/`$` keys/very long | stored truncated and escaped; no injection |

## 6. Ops screens (Y5)
Retry allowed < 7 days, blocked ≥ 7 days; stats equal DB counts; banners per state; purge deletes only `yt_reply_logs`; Overview shows both platforms and platform badges.

## 7. Manual E2E script (Y2, Y4, Y6)
1. Connect channel; confirm name shown.
2. Rule A: test video → `LINK` → `https://example.com/a`; Rule B: another video → `GUIDE` → `https://example.com/b`.
3. Second account: `link please` on A → reply with `/a` within one cycle (or **Poll now**).
4. `guide` on A → no reply. `guide` on B → reply with `/b`.
5. Second account comments `link` again on A → no second reply (one per author).
6. Pause rule A → comment → no reply; resume → comments made while paused are not replied to (cursor behaviour) — verify and document.
7. Confirm reply visibility logged-out; note if held for review.
8. Revoke access in Google account → app shows **Reconnect**; reconnect → polling resumes.
9. Verify Instagram tab still works (rule + comment → DM).

## 8. Definition of done (per phase)
- [ ] Acceptance checklist in `YT-09-BUILD-PHASES.md` ticked.
- [ ] `npm run lint` clean, `npm test` green (Instagram + YouTube), app boots with YouTube enabled and disabled.
- [ ] No secrets or tokens in code, logs or git; `.env.example` updated.
- [ ] Docs updated if behaviour differed (with approval); status table, commit, tag, report delivered.

## 9. Coverage targets
≥ 80% lines on `src/youtube`; 100% branch on quota day logic, matcher, error classification.
