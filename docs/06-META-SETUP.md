# 06 — Meta Developer Setup (manual, done by the human)

Meta's dashboard changes often. Use this as a guide and follow on-screen wording where it differs. Items marked **VERIFY** must be checked against https://developers.facebook.com/docs/instagram-platform.

## Phase 0 checklist (before coding)
- [ ] Instagram account switched to **Professional** (Creator or Business): Instagram → Settings → Account type and tools.
- [ ] Free account at developers.facebook.com.
- [ ] MongoDB Atlas free M0 cluster created; DB user + connection string saved.
- [ ] Cloudflare Tunnel (`cloudflared`) or ngrok installed.
- [ ] Node.js 20 and Git installed.
- [ ] A second Instagram account (friend or spare) for testing comments.

## Step 1 — Create the Meta app
1. Meta for Developers → My Apps → Create App.
2. Choose the use case for managing messaging/content on Instagram (Business type app).
3. Note **App ID** and **App Secret** (App settings → Basic). Put them in `.env` as `IG_APP_ID`, `IG_APP_SECRET`.

## Step 2 — Add Instagram product
1. Add the **Instagram** product → **API setup with Instagram login**.
2. Add your Professional Instagram account under the account list, log in to authorize it.
3. If prompted, add it as an Instagram tester (App roles → Roles) and accept the invite in the Instagram app (Settings → Apps and websites → Tester invites).

## Step 3 — Permissions
Request/enable for your own account:
- `instagram_business_basic`
- `instagram_business_manage_messages` (private replies)
- `instagram_business_manage_comments` (comments webhook / public replies) — **VERIFY** whether required for the `comments` webhook.

## Step 4 — Generate access token
1. In the API setup page, click **Generate token** for your account.
2. Copy the token → `.env` as `IG_ACCESS_TOKEN` (used once to bootstrap, then stored encrypted in DB).
3. Copy your Instagram professional account ID → `IG_USER_ID`.
4. **VERIFY** the token is long-lived (~60 days). If it is short-lived, exchange it for a long-lived one as described in Meta docs.

## Step 5 — Webhooks (after Phase 3 is built)
1. Start the app locally, start the tunnel: `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`).
2. In the Instagram API setup → **Configure webhooks**:
   - Callback URL: `https://<tunnel-host>/webhook`
   - Verify token: the exact value of `IG_VERIFY_TOKEN`
3. Click Verify and Save → your app must return the challenge (Phase 3 handles this).
4. Subscribe to the **`comments`** field.
5. Subscribe the account to the app: `POST /<IG_USER_ID>/subscribed_apps?subscribed_fields=comments` (see `05-API-SPEC.md`), or use the dashboard toggle if shown.

## Step 6 — Test in development mode
1. Keep the app in **Development** mode.
2. Comment on one of your own reels from the second account.
3. Expected: the webhook hits your server. **VERIFY**: in development mode, webhooks may only fire for accounts with a role on the app. If the second account's comments do not arrive, add that account as an Instagram tester on the app.
4. Confirm a DM arrives from your account to the commenter (check Requests folder if they do not follow you).

## Step 7 — Going live (free)
- For your own single account, development mode with Standard access is expected to be enough. **VERIFY**: do not submit for App Review unless real-world testing shows commenters who are not testers are not delivered.
- Update the webhook Callback URL to the Render URL after Phase 8.
- Token expires about every 60 days; the app refreshes it automatically (Phase 6).

## Troubleshooting
| Symptom | Check |
|---------|-------|
| Webhook verify fails | `IG_VERIFY_TOKEN` matches exactly; tunnel is running; `GET /webhook` returns plain-text challenge |
| No webhook on comment | Subscribed to `comments`; account subscribed via `subscribed_apps`; commenter has a role (dev mode); reel belongs to the connected account |
| Signature invalid | Using correct `IG_APP_SECRET`; raw body (not re-serialized JSON) used for HMAC |
| DM fails with permission error | Permissions granted; token generated after permissions were enabled |
| Error code 190 | Token expired or revoked; regenerate and update via admin settings |
