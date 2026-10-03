# YT-10 — Deployment Changes (YouTube Module)

Base setup is in `/docs/10-DEPLOYMENT.md`. This file lists only the differences.

## 1. Local development
- **No tunnel needed for YouTube** (polling + OAuth redirect to `localhost`). The Instagram webhook still needs the tunnel.
- Add to `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optionally the `YT_*` vars from `YT-03-TECH-STACK.md`.
- Redirect URI registered in Google: `http://localhost:3000/admin/youtube/oauth/callback`.
- Debug a cycle without waiting: `npm run poll:yt`.

## 2. Render (free)
1. Add env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (or rely on `BASE_URL`), `YT_ENABLED=true`, quota/limit vars if you want non-defaults.
2. In Google Cloud console add the production redirect URI: `https://<service>.onrender.com/admin/youtube/oauth/callback`.
3. Deploy, open `/admin/youtube`, click **Connect YouTube** on the production URL (tokens are per environment; reconnect after moving from local to prod).
4. The poller runs **inside the web process**. It only works while the instance is awake, so the UptimeRobot `/health` ping every 5 minutes is required (same monitor as Instagram — no new monitor needed).
5. After a sleep/restart the poller catches up automatically from stored cursors; unique `commentId` prevents duplicate replies.
6. During a redeploy two instances may briefly overlap; the DB lock prevents double polling.

## 3. Health check
`GET /health` stays fast and must **not** call Google. Optionally include `youtube: { enabled, connected, lastPollAt, lastPollStatus }` read from the DB (cheap query), never an API call.

## 4. Post-deploy checklist
- [ ] `/health` is 200; Instagram flow still works (comment → DM).
- [ ] YouTube tab shows the channel as connected; quota meter visible.
- [ ] Rule on a test video → second-account comment → reply posted within one cycle.
- [ ] Reply visible when viewed from another account (not held for review).
- [ ] Google console quota graph roughly matches the in-app estimate.

## 5. Operations
| Situation | Action |
|-----------|--------|
| Banner "Reconnect YouTube" | Settings → Reconnect (token revoked or expired) |
| `quotaExceeded` | Nothing to do; replies resume after Pacific midnight; reduce polling or variants if frequent |
| Replies not appearing publicly | Check YouTube Studio → Comments → "Held for review"; try plain short links |
| Missed period (service down) | Cursor catch-up on restart; comments older than the cursor are not re-processed unless backfill is used |
| Change Google client secret | Update Render env, redeploy; refresh tokens remain valid for the same client |
| Cost | All free: Atlas M0, Render free, UptimeRobot free, YouTube Data API default quota |

## 6. Rollback
Redeploy the previous commit in Render. YouTube data lives in separate `yt_` collections, so rolling back code does not corrupt Instagram data. Set `YT_ENABLED=false` to switch the module off without a code change.
