# ReelRelay — YouTube Module (Docs Index)

Adds a **YouTube** tab next to the existing **Instagram** tab in the same ReelRelay project. A viewer comments a keyword on your video or Short; ReelRelay posts a public reply with your link.

> YouTube has **no DMs**. The reply is a public comment under the viewer's comment.

These files live in `/docs/youtube/` and use the `YT-` prefix so they never collide with the Instagram docs in `/docs/`.

## Read order
| # | File | Purpose |
|---|------|---------|
| 0 | `/docs/AGENT-RULES.md` | Existing global agent rules (still apply) |
| 0b | `YT-AGENT-ADDENDUM.md` | Extra rules for this module |
| 1 | `YT-01-PRD.md` | What and why |
| 2 | `YT-02-ARCHITECTURE.md` | Design, tab navigation, integration with existing code |
| 3 | `YT-03-TECH-STACK.md` | New env vars, no new heavy dependencies |
| 4 | `YT-04-DATABASE-SCHEMA.md` | New collections |
| 5 | `YT-05-API-SPEC.md` | Routes + YouTube/Google API contracts + quota math |
| 6 | `YT-06-GOOGLE-SETUP.md` | Manual Google Cloud / OAuth setup (human) |
| 7 | `YT-07-UI-UX.md` | Tabs and YouTube screens |
| 8 | `YT-08-SECURITY.md` | Threats and mitigations |
| 9 | `YT-09-BUILD-PHASES.md` | Phases Y0–Y7, tests, commits, status table |
| 10 | `YT-10-DEPLOYMENT.md` | Changes to local/Render setup |
| 11 | `YT-11-TESTING.md` | Test strategy and definition of done |

## Workflow
Same as the Instagram build: one phase → lint + test + boot → commit → tag `yt-phase-N` → report → **wait for `next`**.

## Key differences from Instagram
| Topic | Instagram | YouTube |
|-------|-----------|---------|
| Delivery of comments | Webhook (push) | Polling (pull) |
| Reply type | Private DM | Public reply comment |
| Auth | Instagram token (60-day refresh) | Google OAuth refresh token |
| Limit | 7-day reply window | Daily API quota (default 10,000 units) |
| Public URL needed locally | Yes (tunnel) | **No** (polling only) |

Items marked **VERIFY** must be confirmed against current Google docs during the phase that uses them.
