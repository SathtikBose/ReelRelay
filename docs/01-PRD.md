# 01 — Product Requirements Document

## 1. Overview
**ReelRelay** is a self-hosted tool for one Instagram creator. Each reel gets a **keyword** and a **link**. When a viewer comments that keyword, ReelRelay automatically sends them a private DM containing the link.

## 2. Problem
Creators say "Comment LINK and I'll DM you the link" in reels, then reply manually to hundreds of comments. Paid automation tools charge monthly fees. The creator wants the same result for free, fully under their own control.

## 3. Goals
- G1: Auto-DM the configured link within seconds of a matching comment.
- G2: Different keyword/link per reel, changeable at any time without redeploying.
- G3: Run at zero cost (local machine or free hosting).
- G4: Never send duplicates; never reply to the wrong reel.
- G5: Simple, mobile-friendly admin panel; clear activity log.

## 4. Non-goals
- Multi-user / SaaS / billing.
- Story replies, live comments, AI chat conversations, CRM features.
- Bulk cold DMs (Instagram only allows replies to commenters).

## 5. User
Single admin: the creator who owns the Instagram Professional account (technical, comfortable with dashboards).

## 6. User stories
- US1: I pick one of my reels, enter keyword `LINK` and a URL, save. Comments with `link` trigger a DM.
- US2: I edit the URL later and future DMs use the new URL.
- US3: I pause a rule without deleting it.
- US4: I see who was messaged, when, and whether it succeeded.
- US5: I retry a failed DM (within the 7-day window).
- US6: I see when my Instagram token will expire and it refreshes automatically.
- US7: I use several keywords per reel (e.g. `LINK`, `GUIDE`).

## 7. Functional requirements
| ID | Requirement |
|----|-------------|
| FR-1 | Receive Instagram `comments` webhooks; verify Meta signature. |
| FR-2 | Match comment text to the rule of that reel (case-insensitive, whole-word by default). |
| FR-3 | Send one private reply per matching comment using the comment ID. |
| FR-4 | Idempotency: same comment ID processed at most once; optional one DM per user per reel. |
| FR-5 | Ignore comments from the account owner and replies to comments (`parent_id`). |
| FR-6 | Admin login (single password), session cookie, CSRF protection. |
| FR-7 | CRUD for reel rules: media ID, keywords[], link, DM template, match mode, active flag. |
| FR-8 | Reel picker that lists recent reels via the Instagram API. |
| FR-9 | Activity log with status (sent / failed / skipped) and filters. |
| FR-10 | Token stored encrypted; auto-refresh before expiry; manual refresh button. |
| FR-11 | `GET /health` endpoint for uptime monitoring. |
| FR-12 | Retry transient failures with backoff; mark permanent failures with reason. |

## 8. Non-functional requirements
- Webhook endpoint responds 200 in < 1 s (processing happens after ack).
- Handles bursts (viral reel) without dropping events: sequential queue with concurrency limit.
- No secrets in git or logs. Follows `08-SECURITY.md`.
- Works on Render free tier (cold start up to ~1 min) and locally.
- Stays within MongoDB Atlas M0 512 MB (log TTL enforced).

## 9. Constraints & platform rules
- Instagram allows **one private reply per comment**, within **7 days** of the comment.
- Reply lands in Inbox if the commenter follows the account, otherwise in Requests.
- Follow-up DMs are only possible if the user replies (24 h window). Out of scope.
- Requires an Instagram **Professional** account and a Meta developer app.

## 10. Success metrics
- ≥ 99% of matching comments receive a DM (excluding platform-blocked cases).
- Median comment-to-DM latency < 10 s when the service is awake.
- Zero duplicate DMs in testing.

## 11. Risks
| Risk | Mitigation |
|------|-----------|
| Dev-mode webhook limitations (**VERIFY**) | Test with a second account that has a role on the app in Phase 3/4. |
| Token expires (~60 days) | Auto-refresh + expiry banner. |
| Render free cold start / sleep | UptimeRobot ping; Meta retries; idempotent handler. |
| Meta API changes | API version in env; isolate all calls in one client module. |
| Spam / abuse comments | Whole-word match, per-user dedupe, own-comment ignore. |
