# 📱 Meta Developer Console Checklist & Configuration Guide

This guide gives you exact, click-by-click instructions to configure your Meta for Developers app, connect your Instagram Business/Creator account, subscribe to webhook events, generate tokens, and understand Development vs. Live mode.

---

## 📋 Overview: What You Need Before You Start

1. A **Meta (Facebook) Account**.
2. An **Instagram Professional Account** (Creator or Business) — *Personal accounts do NOT support webhooks or automated direct messages*.
3. A **Facebook Page** linked to your Instagram Professional Account.
4. Your deployed Cloudflare Worker URL (e.g. `https://reelrelay.<subdomain>.workers.dev`).
5. Your GitHub Pages legal URLs from Phase 7:
   - Privacy Policy: `https://sathtikbose.github.io/ReelRelay/privacy.html`
   - Terms of Service: `https://sathtikbose.github.io/ReelRelay/terms.html`
   - Data Deletion: `https://sathtikbose.github.io/ReelRelay/data-deletion.html`

---

## Step 1: Create a Meta App

1. Go to **[developers.facebook.com](https://developers.facebook.com/)** and log in.
2. Click **My Apps** in the top right corner.
3. Click the green **Create App** button.
4. Select **Other** (or **Business**) as the use case > click **Next**.
5. Select **Business** as the app type > click **Next**.
6. Enter app details:
   - **App Name:** `ReelRelay` (or your brand name)
   - **App Contact Email:** your email (`sathtikbose@gmail.com`)
   - **Business Account:** Select your Meta Business Portfolio (if you have one, or create one).
7. Click **Create App**.

---

## Step 2: Configure App Settings > Basic

In the left navigation sidebar of your Meta App:
1. Click **App Settings** > **Basic**.
2. Fill in the required fields:
   - **Display Name:** `ReelRelay`
   - **Privacy Policy URL:** `https://sathtikbose.github.io/ReelRelay/privacy.html`
   - **Terms of Service URL:** `https://sathtikbose.github.io/ReelRelay/terms.html`
   - **User Data Deletion:**
     - Select dropdown: **Data Deletion Instructions URL**
     - Enter URL: `https://sathtikbose.github.io/ReelRelay/data-deletion.html`
   - **Category:** Select `Business and Pages` or `Productivity`.
   - **App Icon:** Upload a 1024 x 1024 pixel PNG or JPG icon.
3. Note your **App ID** and **App Secret** (click *Show*):
   - Copy **App ID** -> Used for `META_APP_ID`.
   - Copy **App Secret** -> Used for `META_APP_SECRET`.
4. Click **Save Changes** at the bottom right.

---

## Step 3: Add Instagram Products to Your App

1. In the left sidebar, click **Dashboard** (or **Add Product**).
2. Scroll to **Instagram** (or **Instagram Graph API**) and click **Set Up**.
3. Scroll to **Webhooks** and click **Set Up** (if not already visible).

---

## Step 4: Configure Webhook Callback & Fields

1. In the left menu, click **Webhooks** (under Products).
2. In the dropdown at the top of the page, select **Instagram** (NOT "User" or "Page").
3. Click the blue **Subscribe to this object** (or **Edit Subscription**) button.
4. A popup will appear with two fields:
   - **Callback URL:**
     ```text
     https://reelrelay.<your-subdomain>.workers.dev/webhook
     ```
   - **Verify Token:**
     Enter the exact random secret string you invented (e.g. `my_secret_verify_token_123` or your generated `META_VERIFY_TOKEN`).
5. Click **Verify and Save**.
   - *What happens under the hood:* Meta sends an instant `GET` request to your Worker with `hub.mode=subscribe`, `hub.challenge`, and `hub.verify_token`. Your Worker cryptographically verifies the token using constant-time comparison and returns the challenge.
6. Once verified, look at the table of subscription fields below:
   - Find the row named **`comments`**.
   - Click **Subscribe** next to `comments`.
   - *(Optional: You can also subscribe to `messages` if you plan to build two-way DM chat in the future, but `comments` is the only event ReelRelay needs to trigger comment-to-DM replies).*

---

## Step 5: Required Permissions & Scopes

For ReelRelay to read incoming comments and send direct message replies, your access token requires these permissions:

| Permission Name | Purpose | Required For |
| :--- | :--- | :--- |
| `instagram_manage_comments` | Allows the app to read comments on your Instagram media and receive webhook alerts. | Reading comments & matching keywords |
| `instagram_manage_messages` | Allows the app to send direct messages (private replies) on Instagram. | Sending DM with requested link |
| `pages_show_list` | Allows the app to find your linked Facebook page. | Token exchange |
| `pages_read_engagement` | Allows the app to read post engagement metrics. | Graph API verification |

---

## Step 6: How to Generate Your Long-Lived Access Token

There are two methods to generate your token. **Method A (System User Token)** is strongly recommended because it never expires when you change your personal Instagram password.

### Method A: Permanent System User Token (Recommended for Production)

1. Open **[business.facebook.com/settings](https://business.facebook.com/settings)** (Meta Business Settings).
2. In the left menu under **Users**, click **System Users**.
3. Click **Add**, name the user `ReelRelay Bot`, and assign role **Admin**.
4. Click **Assign Assets**:
   - Add your **Facebook Page** and your **Instagram Account** with full control / manage permissions.
5. Click **Generate New Token**:
   - Select your **ReelRelay** App.
   - Token expiration: Select **Never** (or maximum allowable).
   - Check the boxes for:
     - `instagram_manage_comments`
     - `instagram_manage_messages`
     - `pages_show_list`
     - `pages_read_engagement`
6. Click **Generate Token**.
7. **Copy this token immediately** — you will never be shown it again. This token is your `META_ACCESS_TOKEN`.

### Method B: Graph API Explorer Token (Alternative)

1. Open the **[Graph API Explorer](https://developers.facebook.com/tools/explorer/)**.
2. Select your **Meta App** in the dropdown.
3. In **User or Page**, select your Facebook User.
4. Under **Permissions**, add:
   - `instagram_manage_comments`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
5. Click **Generate Access Token** and approve permissions.
6. To make it a 60-day Long-Lived Token:
   - Open the **[Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)**.
   - Paste the short-lived token and click **Debug**.
   - Scroll down and click **Extend Access Token**.
   - Copy the generated 60-day token.

---

## Step 7: Find Your Instagram Business Account ID (`IG_BUSINESS_ACCOUNT_ID`)

In the **[Graph API Explorer](https://developers.facebook.com/tools/explorer/)**:
1. Paste your access token.
2. In the query box, enter:
   ```http
   GET /me/accounts?fields=name,instagram_business_account{id,username}
   ```
3. Click **Submit**.
4. The response will include:
   ```json
   {
     "data": [
       {
         "name": "Your Page Name",
         "instagram_business_account": {
           "id": "17841400000000000",
           "username": "your_instagram_handle"
         }
       }
     ]
   }
   ```
5. Copy the numeric `id` inside `instagram_business_account` (e.g. `17841400000000000`). This is your **`IG_BUSINESS_ACCOUNT_ID`**.

---

## Step 8: Development Mode vs. Live Mode (Honest Breakdown)

### 🧪 Development Mode (Active by default)
- **Who it works for:** **Only accounts that have an assigned role in your Meta App** (Administrators, Developers, and Testers).
- **Behavior:**
  - If you or an authorized tester comments on your Reel, the webhook fires and the DM is sent successfully.
  - If a **random public follower** comments on your Reel, Meta will **silently drop the event or return a permission error**.
- **How to test with multiple accounts in Development Mode:**
  1. Go to your Meta App Dashboard > **App Roles** > **Roles**.
  2. Under **Instagram Testers**, click **Add Instagram Testers**.
  3. Type the Instagram username of your personal/secondary account.
  4. On that second Instagram account: Open Instagram app > **Settings and Privacy** > **Apps and Websites** > **Tester Invites** > click **Accept**.
  5. That second account can now test commenting and receiving DMs!

### 🌍 Live Mode & App Review (Required for General Public)
- **Who it works for:** **Any user on Instagram worldwide** who comments on your Reels.
- **Requirements to switch to Live Mode:**
  1. **Complete Basic Settings:** Privacy Policy URL, Terms of Service URL, Data Deletion URL, and App Icon (all ready in Phase 7!).
  2. **Submit for Meta App Review:**
     - Under **App Review** > **Permissions and Features**, request:
       - `instagram_manage_comments`
       - `instagram_manage_messages`
     - Provide a short 1-2 minute screencast video showing:
       - Creator configuring a trigger keyword in the ReelRelay dashboard.
       - A user leaving a comment containing that keyword on an Instagram Reel.
       - The user opening their Instagram inbox and viewing the automated direct message reply.
  3. **Business Verification:**
     - Meta requires your Meta Business Account to be verified (uploading official business documents, government ID, or utility bill confirming your brand).
- **Summary Recommendation:**
  - Start immediately in **Development Mode** with yourself and designated Instagram Testers. It is 100% free, fast, and does not require business verification.
  - When ready to release to all followers, record the short demo video and submit for App Review.
