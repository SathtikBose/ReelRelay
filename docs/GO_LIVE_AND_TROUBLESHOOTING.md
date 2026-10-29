# 🧪 Go-Live Testing, Troubleshooting & Decommissioning Guide

This guide provides an end-to-end testing script to verify your Instagram comment-to-DM automation in real life, a comprehensive troubleshooting reference table, and instructions to decommission your old Render service and UptimeRobot monitor.

---

## 🎯 End-to-End Go-Live Test Script

Follow these 5 steps to verify that ReelRelay triggers and delivers direct messages on Instagram.

### Step 1: Open the Admin Dashboard
1. Navigate to your live production Worker URL in your browser:
   ```text
   https://reelrelay.<your-subdomain>.workers.dev/
   ```
2. Enter your `ADMIN_PASSWORD` to log in.
3. Click **Add Rule** to create a test automation rule:
   - **Reel / Media ID:** Enter your Instagram Reel ID, or `*` (asterisk) to match **ALL** reels on your account.
   - **Trigger Keyword:** `LINK`
   - **Match Mode:** `Contains Word`
   - **Direct Message:** `Hey {username}! 🎉 Here is the exclusive link you requested:`
   - **Resource Link:** `https://example.com/guide`
   - **Status:** Active (Checked)
4. Click **Save Rule**.

---

### Step 2: Open Real-Time Worker Logs
In your local computer terminal, run the following command to stream live incoming execution logs from Cloudflare:
```bash
npx wrangler tail
```
*(Or in Cloudflare Dashboard: go to **Workers & Pages** > **reelrelay** > **Logs** > click **Begin streaming logs**).*

---

### Step 3: Post a Test Comment on Your Reel
From a **secondary Instagram account** (or designated Instagram Tester account if your app is in Development Mode):
1. Open Instagram on your mobile phone or browser.
2. Navigate to your creator account's Reel.
3. Post a comment containing your keyword:
   ```text
   Can you send me the LINK please?
   ```

---

### Step 4: Verify the Direct Message Delivery
1. Check your secondary Instagram account's **Direct Message (DM) Inbox**.
2. Within **1 to 3 seconds**, you should receive a private message:
   ```text
   Hey your_username! 🎉 Here is the exclusive link you requested: https://example.com/guide
   ```
3. Post a second comment on the same Reel with `LINK` to verify deduplication. No duplicate DM will be sent!

---

### Step 5: Verify the Log Output in `wrangler tail`
Your terminal will stream structured events without exposing tokens:
```json
{"level":"info","msg":"Incoming Instagram webhook POST request received"}
{"level":"info","commentId":"18029384729102938","msg":"Enqueued Instagram comment event for delivery pipeline"}
{"level":"info","commentId":"18029384729102938","keyword":"LINK","msg":"Matched keyword rule for reel"}
{"level":"info","commentId":"18029384729102938","msg":"Successfully delivered Instagram private reply DM"}
```

---

## 🩺 Troubleshooting Guide

| Issue | Likely Cause | Exact Solution |
| :--- | :--- | :--- |
| **Meta Webhook Verification Fails (`GET /webhook` 403)** | `META_VERIFY_TOKEN` in Cloudflare Secrets does not match the token entered in the Meta console. | 1. Run `npx wrangler secret put META_VERIFY_TOKEN`.<br>2. Ensure the string you enter in Meta matches character-for-character with no trailing spaces.<br>3. Confirm the URL ends with `/webhook`. |
| **403 Invalid Webhook Signature on Comments** | `META_APP_SECRET` mismatch. Meta signs incoming POST payloads using HMAC SHA-256 with your App Secret. | 1. Go to Meta Developers > App Settings > Basic.<br>2. Click **Show** next to App Secret and copy it.<br>3. Run `npx wrangler secret put META_APP_SECRET` and paste the exact secret. |
| **Comment left on Reel, but no log in `wrangler tail`** | The `comments` webhook field is not subscribed in the Meta Developer Console. | 1. In Meta Developers Console, go to **Webhooks**.<br>2. Select **Instagram**.<br>3. Ensure **`comments`** is subscribed (it should show a green checkmark / Subscribed). |
| **Log says `400 Bad Request` or `Permissions error` on DM dispatch** | 1. App is in **Development Mode** and commenter is not an authorized Tester.<br>2. Token lacks `instagram_manage_messages` scope. | 1. In Meta Console, go to **App Roles** > **Roles** > **Instagram Testers** and add the commenter's account.<br>2. Or re-generate your token ensuring `instagram_manage_messages` is checked.<br>3. To allow all public users, submit for App Review (see [Meta Setup Checklist](META_SETUP_CHECKLIST.md)). |
| **Log says `Message could not be sent: outside 7-day policy window`** | Meta policy strictly forbids sending private replies to comments older than 7 days. | Comment on a recent Reel (posted within the last 7 days). ReelRelay protects your Meta account standing by discarding stale comments. |
| **Log says `Comment already claimed/processed by pipeline`** | ReelRelay's atomic idempotency prevented a duplicate DM. | This is normal expected behavior! Cloudflare D1 uses `INSERT OR IGNORE` to guarantee a commenter never gets spammed if Meta sends duplicate webhooks or if the user posts twice. |
| **`OAuthException: Error validating access token: Session has expired`** | A short-lived user token was used and reached its expiration date. | Generate a permanent **System User Access Token** with expiration set to **Never** per [docs/META_SETUP_CHECKLIST.md](META_SETUP_CHECKLIST.md). Update it with `npx wrangler secret put META_ACCESS_TOKEN`. |
| **Dashboard Login returns 429 Too Many Requests** | Brute-force rate limiter triggered after 5 consecutive failed login attempts within 15 minutes. | Wait 15 minutes for the window to reset, or clear your IP state by updating `ADMIN_PASSWORD`. |

---

## 🗑️ How to Decommission Render & UptimeRobot

Now that ReelRelay runs natively 24/7 on Cloudflare Workers edge network, your old Render web service and UptimeRobot uptime pinger are completely obsolete and can be safely deleted.

### Step 1: Delete or Suspend the Render Web Service
1. Log into your **[Render Dashboard](https://dashboard.render.com/)**.
2. Click on your existing ReelRelay web service.
3. Go to the **Settings** tab in the left sidebar.
4. Scroll all the way down to the bottom **Danger Zone**:
   - To pause it temporarily: click **Suspend Service**.
   - To delete it permanently (recommended): click **Delete Web Service**, type the service name to confirm, and click **Delete**.
5. If you provisioned a MongoDB Atlas cluster on Render that is no longer needed, you can delete or pause that cluster as well. All database operations now run natively in Cloudflare D1.

### Step 2: Delete the UptimeRobot Monitor
Cloudflare Workers run on-demand serverless isolates across 300+ data centers. They never spin down, never enter a sleep state, and do not suffer cold starts. Keeping an uptime pinger hitting your Worker only wastes your free daily request allowance!

1. Log into your **[UptimeRobot Dashboard](https://uptimerobot.com/dashboard)**.
2. Locate the monitor pointing to `https://<your-old-render-app>.onrender.com/health` (or your worker URL).
3. Click the gear icon / settings next to the monitor.
4. Select **Pause** or **Delete**.
