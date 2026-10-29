# 🚀 Cloudflare Workers Deployment Guide (CI/CD)

This guide walks you through deploying **ReelRelay** to Cloudflare Workers so it runs 24/7 on the free tier with zero cold starts, zero sleeping, and automated continuous deployment (CI/CD) whenever you push code to GitHub.

---

## 📋 Prerequisites

1. A free **[Cloudflare Account](https://dash.cloudflare.com/sign-up)**.
2. Your code pushed to your GitHub repository (**`https://github.com/SathtikBose/ReelRelay`**).
3. Node.js (v20+) installed on your machine.

---

## Step 1: Create Your Remote Cloudflare D1 Database

ReelRelay uses **Cloudflare D1** (serverless SQLite at the edge) to store keywords, track processed comments, and log activities.

1. In your local terminal, authenticate Wrangler with your Cloudflare account (if you haven't already):
   ```bash
   npx wrangler login
   ```
   *(A browser window will open asking you to click **Allow**).*

2. Create the remote production database:
   ```bash
   npx wrangler d1 create reelrelay-db
   ```

3. Wrangler will output something like this:
   ```text
   ✅ Successfully created DB 'reelrelay-db'!

   [[d1_databases]]
   binding = "DB"
   database_name = "reelrelay-db"
   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

4. Open [`wrangler.jsonc`](../wrangler.jsonc) in your project and replace `"database_id": "placeholder-will-be-updated-in-phase-3"` with your actual `database_id` string:
   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "reelrelay-db",
       "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
     }
   ]
   ```

---

## Step 2: Apply Database Migrations to Remote D1

Now execute the SQL schema to create the `keywords`, `processed_comments`, and `events_log` tables in your live production database:

```bash
npx wrangler d1 migrations apply DB --remote
```

When prompted:
```text
✔ About to apply 1 migration(s)
  0001_init.sql
  Are you sure you want to proceed? (y/n)
```
Type `y` and press **Enter**.

---

## Step 3: Set Up Cloudflare Workers Builds (GitHub CI/CD)

Cloudflare Workers Builds automatically tests and redeploys your application whenever you push a new commit to your `main` branch.

1. Go to your **[Cloudflare Dashboard](https://dash.cloudflare.com/)**.
2. In the left navigation menu, click **Workers & Pages**.
3. Click the blue **Create application** button at the top right.
4. Select the **Import a repository** (or **Connect to Git**) tab.
5. Connect your GitHub account and authorize Cloudflare to access the repository:
   - Select repository: **`SathtikBose/ReelRelay`**
6. Configure the deployment settings:
   - **Project Name / Worker Name:** `reelrelay` *(⚠️ Note: Must match the `"name": "reelrelay"` field in `wrangler.jsonc`)*.
   - **Production Branch:** `main`.
   - **Framework Preset:** `None` (or `Wrangler`).
   - **Build Command:** `npm run typecheck` *(ensures zero TypeScript compiler errors before deploying)*.
   - **Deploy Command:** `npx wrangler deploy`.
   - **Root Directory:** `/`.
7. Click **Save and Deploy**.

Cloudflare will immediately start the initial build and deploy your Worker globally.

---

## Step 4: Add Production Secrets to Cloudflare

Your Worker requires 7 secrets to interact with Instagram Graph API and secure the admin dashboard. **Never commit secrets to git.**

### Method A: Using Wrangler CLI (Fastest & Recommended)

Run each command in your terminal. Wrangler will prompt you to enter the secret value securely:

```bash
# 1. Meta App ID
npx wrangler secret put META_APP_ID

# 2. Meta App Secret (used for HMAC SHA-256 webhook signature verification)
npx wrangler secret put META_APP_SECRET

# 3. Webhook Verify Token (secret string you invent to verify your webhook in Meta)
npx wrangler secret put META_VERIFY_TOKEN

# 4. Long-Lived Instagram Graph API Access Token
npx wrangler secret put META_ACCESS_TOKEN

# 5. Instagram Professional Account ID
npx wrangler secret put IG_BUSINESS_ACCOUNT_ID

# 6. Admin Dashboard Master Password (12+ characters)
npx wrangler secret put ADMIN_PASSWORD

# 7. Session Cookie Signing Secret (32+ random characters)
npx wrangler secret put SESSION_SECRET
```

### Method B: Via the Cloudflare Web Dashboard

If you prefer using the web interface:
1. Go to **Workers & Pages** in your Cloudflare Dashboard.
2. Click on your Worker: **`reelrelay`**.
3. Go to the **Settings** tab.
4. In the left submenu, click **Variables and Secrets**.
5. Under **Secrets**, click **Add**.
6. Type the Variable Name (e.g., `ADMIN_PASSWORD`), enter the Secret Value, and click **Encrypt**.
7. Repeat for all 7 secrets.
8. Click **Deploy** to apply the updated environment to the running Worker.

---

## Step 5: (Optional) Direct CLI Deploy

If you ever want to push a manual update immediately without waiting for GitHub CI/CD, you can run:

```bash
npm run deploy
```
*(This executes `wrangler deploy`, which compiles TypeScript, bundles static assets, uploads them to Cloudflare, and activates the new version in under 5 seconds).*

---

## Step 6: Find Your Live `workers.dev` URL

Once deployed, Cloudflare assigns your Worker a permanent, globally distributed HTTPS subdomain:

1. In the Cloudflare Dashboard, go to **Workers & Pages** > **reelrelay**.
2. Look right under the project title at the top of the page, or check **Settings** > **Domains & Routes**.
3. Your URL will look like:
   ```text
   https://reelrelay.<your-cloudflare-subdomain>.workers.dev
   ```

### Verify Your Deployment:

1. **Test Health Endpoint:**
   Open:
   ```text
   https://reelrelay.<your-cloudflare-subdomain>.workers.dev/health
   ```
   You should see:
   ```json
   {
     "status": "ok",
     "service": "ReelRelay",
     "timestamp": "2026-10-29T...",
     "uptime": 12.34
   }
   ```

2. **Open the Admin Dashboard:**
   Open:
   ```text
   https://reelrelay.<your-cloudflare-subdomain>.workers.dev/
   ```
   You will see the ReelRelay login screen. Log in using your `ADMIN_PASSWORD` to create your first keyword trigger rule!

---

## 🔄 How Continuous Deployment Works

- Cloudflare maintains a direct webhook connection to your GitHub repository.
- Every time you push a commit to `main` (`git push origin main`):
  1. Cloudflare spins up an isolated build container.
  2. Runs `npm ci` to install dependencies.
  3. Executes `npm run typecheck` to ensure there are no syntax or type errors.
  4. Runs `npx wrangler deploy` to push your Worker and static assets to Cloudflare's edge network across 300+ global cities.
- The entire process finishes in approximately **20-30 seconds** with zero downtime.
