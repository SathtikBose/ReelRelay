# YT-01 — Product Requirements (YouTube Module)

## 1. Overview
A second tab in ReelRelay. For each YouTube video or Short the creator sets **keywords** and a **link**. When a viewer posts a top-level comment containing a keyword, ReelRelay replies publicly under that comment with the link.

## 2. Problem
Creators say "comment GUIDE and I'll share the link" and then reply by hand. Paid tools charge monthly. The creator wants a free, self-hosted version inside the tool already built for Instagram.

## 3. Goals
- G1: Auto-reply within a few minutes of a matching comment.
- G2: Per-video keywords, links and reply text, editable any time.
- G3: Free to run (local or Render free tier), no webhook/tunnel needed.
- G4: Never double-reply; never exceed the YouTube API quota unexpectedly.
- G5: Single admin UI with an **Instagram | YouTube** tab switch.

## 4. Non-goals
- DMs (not possible on YouTube), live-chat replies, replying to replies, moderation, sentiment/AI replies, multi-channel support.
- Multi-user / SaaS.

## 5. User
The single admin who owns one YouTube channel and the Instagram account already connected.

## 6. User stories
- US1: I connect my YouTube channel with Google login.
- US2: I pick one of my videos/Shorts, set keyword `GUIDE` and a link; matching comments get a reply.
- US3: I add 2–5 reply variants so replies are not identical.
- US4: I pause/resume a rule and delete it.
- US5: I see every reply attempt with status, and retry failed ones.
- US6: I see today's API quota usage and when it resets.
- US7: When Google revokes access, I see "Reconnect YouTube" and fix it in one click.
- US8: I switch between Instagram and YouTube without losing context.

## 7. Functional requirements
| ID | Requirement |
|----|-------------|
| YFR-1 | Google OAuth (authorization code + PKCE, offline access) to connect the channel; encrypted refresh token; disconnect + revoke. |
| YFR-2 | Video picker listing recent uploads (videos + Shorts) from the channel. |
| YFR-3 | CRUD for video rules: videoId, keywords[], matchMode, link, replyVariants[1..5], active, backfill flag. |
| YFR-4 | Poller checks active rules on a schedule using a per-video cursor; processes only new top-level comments. |
| YFR-5 | First poll of a new rule starts from "now" (no replies to old comments) unless backfill is enabled. |
| YFR-6 | Match with the shared matcher (word / exact / contains). |
| YFR-7 | Post reply with `comments.insert` under the matching top-level comment. |
| YFR-8 | Idempotency by unique `commentId`; ignore the channel owner's own comments. |
| YFR-9 | Quota guard: track estimated units/day, stop replying at a soft budget, defer to next quota day. |
| YFR-10 | Reply throttling: max replies/hour and random delay between replies. |
| YFR-11 | Retries for transient errors; clear permanent failure reasons. |
| YFR-12 | Activity log, stats, "Poll now" button, quota meter. |
| YFR-13 | Admin tab navigation (Overview, Instagram, YouTube) with namespaced routes; old Instagram URLs redirect. |
| YFR-14 | Everything stays free-tier: MongoDB Atlas M0, Render free, UptimeRobot. |

## 8. Non-functional requirements
- Poller survives restarts without missing or duplicating replies (DB cursors + unique index).
- Poll cycle never overlaps itself (lock) and never blocks the web server.
- No secrets in logs/git; follow `YT-08-SECURITY.md`.
- Instagram features unchanged (all existing tests green).

## 9. Constraints & platform facts
- Default quota 10,000 units/day. Reading comments ≈ 1 unit, posting a reply ≈ 50 units → ~150–190 replies/day after polling cost (**VERIFY** costs in Google's quota calculator).
- Public replies may be held or hidden by YouTube's spam filtering, especially with links.
- If the Google OAuth app is in *Testing* status, refresh tokens may expire after ~7 days (**VERIFY**); reconnect flow is mandatory.

## 10. Success metrics
- ≥ 95% of matching comments get a reply within 2 poll cycles while quota remains.
- Zero duplicate replies in testing. Zero Instagram regressions.

## 11. Risks
| Risk | Mitigation |
|------|-----------|
| Quota exhausted on a viral video | Soft budget, adaptive polling, deferral + banner |
| Replies flagged as spam | Variants, hourly cap, jitter, short plain links |
| Refresh token expiry/revocation | `needs_reauth` state + reconnect banner |
| Duplicate poller during Render redeploy | DB lock + unique `commentId` |
| Missed comments while asleep | Cursor-based catch-up on wake |
