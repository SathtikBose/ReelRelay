# 11 — Testing Strategy & Definition of Done

## 1. Levels
| Level | Tooling | Scope |
|-------|---------|-------|
| Unit | Jest | matcher, template, crypto, env validation, error classification |
| Integration | Jest + supertest + `mongodb-memory-server` | routes, models, pipeline with mocked Instagram |
| Contract | fixtures in `tests/fixtures/` | sample Meta webhook payloads and API responses |
| Manual E2E | real Instagram + second account | webhook delivery, DM arrival |
| Smoke | `scripts/smoke.js` | deployed service sanity |

Rules: tests are deterministic, need no internet or real credentials, and never call the real Instagram API. Time-based code uses fake timers.

## 2. Matcher test matrix (Phase 4)
| Comment | Keyword `link`, mode `word` | Mode `exact` | Mode `contains` |
|---------|----|----|----|
| `LINK` | match | match | match |
| `link please` | match | no | match |
| `Link!!!` | match | match (punctuation stripped) | match |
| `linkedin profile` | **no** | no | match |
| `send me the LINK 🙏` | match | no | match |
| `l1nk` | no | no | no |
| empty / emoji only | no | no | no |
| `  LiNk  ` | match | match | match |

## 3. Webhook test cases (Phase 3)
- Valid signature + valid comment payload → 200, one event enqueued.
- Signature computed on a different body → 401.
- No signature header → 401.
- Correct verify token on GET → 200 with challenge; wrong → 403.
- Reply comment (`parent_id`) → ignored. Own comment → ignored.
- Payload with unexpected shape → 200, logged, no crash.
- Payload > 1 MB → rejected.

## 4. Pipeline test cases (Phase 4)
- No rule for media → skipped, no send.
- Inactive rule → skipped.
- Keyword not matched → skipped/counted, no send.
- Match → claim inserted, client called once with correct `comment_id` and rendered text.
- Duplicate delivery of the same comment → one send.
- Same user comments twice on same reel (one-DM-per-user on) → second skipped.
- Client transient failure twice then success → status `sent`, `attempts=3`.
- Client permanent failure → `failed`, no retry, sanitized message.
- Token error (190) → `failed`, auth flag set.
- Concurrency: 20 events in parallel → no duplicate sends, no lost logs.

## 5. Admin test cases (Phases 5–6)
- Every route: unauthenticated access blocked.
- Login: correct/incorrect password; lockout on 6th attempt.
- CSRF: POST without token → 403.
- Rule validation: non-https link, empty keywords, duplicate reel, oversized template, `$`-prefixed keys.
- XSS: caption `<script>alert(1)</script>` renders escaped.
- Retry: allowed < 7 days, blocked ≥ 7 days.
- Token refresh: success updates expiry; failure recorded and banner shown.

## 6. Manual E2E script (run at Phases 4, 5, 8)
1. Create rule: reel A → keyword `LINK` → `https://example.com/a`; reel B → `GUIDE` → `https://example.com/b`.
2. From second account: comment `link` on A → DM contains `/a`.
3. Comment `guide` on B → DM contains `/b`.
4. Comment `guide` on A → **no DM**.
5. Comment `link` twice on A → one DM only (if per-user dedupe on).
6. Pause rule A → comment → no DM; resume → DM.
7. Check Activity page reflects every step.

## 7. Definition of done (per phase)
- [ ] Acceptance checklist in `09-BUILD-PHASES.md` fully ticked.
- [ ] `npm run lint` — 0 errors. `npm test` — all green. App boots.
- [ ] No secrets or debug code committed; `.env.example` updated for any new variable.
- [ ] Docs updated if behaviour differed from spec (with human approval).
- [ ] Commit + tag created; status table updated; phase report delivered.

## 8. Coverage targets
≥ 80% lines on `src/services` and `src/routes` by Phase 7; matcher and crypto at 100% branch coverage.
