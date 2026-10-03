# YT-06 — Google Cloud & OAuth Setup (manual, human)

Google's console changes often; follow on-screen wording where it differs. **VERIFY** items must be checked in the current docs: https://developers.google.com/youtube/v3

## Phase Y0 checklist
- [ ] A YouTube channel (the one you own and want to auto-reply on).
- [ ] A Google account that owns that channel (Brand account: choose the right channel during consent).
- [ ] A **second Google account** with its own YouTube identity for testing comments.
- [ ] An **unlisted or public test video** on your channel for testing.
- [ ] Existing ReelRelay project running locally.

## Step 1 — Create a Google Cloud project
1. console.cloud.google.com → New Project (e.g. `reelrelay`). No billing required.

## Step 2 — Enable the API
APIs & Services → Library → **YouTube Data API v3** → Enable.

## Step 3 — OAuth consent screen
1. APIs & Services → OAuth consent screen (or "Google Auth Platform").
2. User type: **External**. App name `ReelRelay`, support email = yours.
3. Scopes: add `https://www.googleapis.com/auth/youtube.force-ssl`.
4. Test users: add your own Google account (and the account that owns the channel).
5. **Publishing status (VERIFY):** apps in *Testing* may get refresh tokens that expire after about 7 days. For a personal single-user tool you can set the app to **In production**; Google may show an "unverified app" warning (click Advanced → continue) and sensitive scopes may require verification only for wider public use. ReelRelay must handle expiry with the Reconnect flow either way.

## Step 4 — OAuth client credentials
1. Credentials → Create credentials → **OAuth client ID** → type **Web application**.
2. Authorized redirect URIs (exact match, including path and no trailing slash):
   - Local: `http://localhost:3000/admin/youtube/oauth/callback`
   - Production (after deploy): `https://<your-service>.onrender.com/admin/youtube/oauth/callback`
3. Copy **Client ID** and **Client secret** → `.env` as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Never commit them.

## Step 5 — Connect in ReelRelay (after Phase Y2)
1. `npm run dev` → log in → YouTube tab → **Connect YouTube**.
2. Choose the account/channel, accept the permission. You are redirected back to the YouTube dashboard showing the channel name.
3. If no refresh token is issued, revoke ReelRelay at https://myaccount.google.com/permissions and connect again.

## Step 6 — Test after Phase Y4
1. In the admin YouTube tab add a rule for your test video: keyword `LINK`, link `https://example.com`.
2. From the second Google account, comment `link please` on that video.
3. Wait up to one poll cycle (or press **Poll now**). A reply from your channel appears under the comment.
4. Check the reply is **visible when logged out / from the second account** — YouTube may hold link replies for review (**VERIFY** behaviour; try a short plain domain if held).

## Quota notes
- Default 10,000 units/day; resets at midnight Pacific Time.
- The Cloud console shows usage under APIs & Services → YouTube Data API v3 → Quotas. Compare with the ReelRelay quota meter during testing.
- Requesting more quota is optional and not guaranteed; the app works within the default.

## Troubleshooting
| Symptom | Check |
|---------|-------|
| `redirect_uri_mismatch` | Console URI matches `GOOGLE_REDIRECT_URI` exactly (scheme, host, port, path) |
| `access_denied` | Your account is a listed test user (Testing status) |
| No refresh token | Revoke prior consent; flow must use `access_type=offline` + `prompt=consent` |
| `invalid_grant` | Token revoked/expired (7-day Testing limit?) → Reconnect |
| `quotaExceeded` | Wait for Pacific midnight; lower polling/replies |
| 403 on reply | Scope granted includes `youtube.force-ssl`; right channel selected |
| No comments returned | Comments disabled on the video, or the video ID is wrong |
