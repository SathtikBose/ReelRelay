# YT-07 — UI / UX (Tabs + YouTube Screens)

Reuse the existing design tokens, layout, components and dark mode from `/docs/07-UI-UX.md`. This file only describes what changes or is new.

## 1. Tab navigation (shell)
**Top-level tabs** (segmented control in the top bar, below the logo on mobile): **Overview · Instagram · YouTube**.
- Active tab has an underline/indicator in the platform accent: Instagram uses the existing primary; YouTube uses red `#E11D48` (light) / `#FB7185` (dark) **only** for the indicator and platform badges — buttons keep the global primary.
- Each platform shows a **sub-nav**: Dashboard · Rules (Reels / Videos) · Activity · Settings. Mobile: bottom bar shows the active platform's 4 items; the platform switch stays in the top bar.
- Status dot next to each tab: green = healthy, amber = needs attention (token expiring, quota near limit), red = broken (needs reconnect / token expired).
- Remember last visited platform (cookie) for the default landing after login; Overview remains reachable.
- Old Instagram URLs redirect; breadcrumbs/titles show "Instagram › Reels" or "YouTube › Videos".

## 2. Overview page (`/admin`)
Two summary cards side by side (stacked on mobile):
- **Instagram:** DMs sent (7 days), failed, active rules, token days left → "Open".
- **YouTube:** replies posted (7 days), failed/deferred, active rules, quota used today → "Open".
If YouTube is not connected, its card shows "Connect YouTube" CTA. Combined recent-activity list (last 10, with platform badge) below.

## 3. YouTube Dashboard (`/admin/youtube`)
- **Not connected state:** explanation ("ReelRelay replies publicly to comments on your videos"), what permission is requested, **Connect YouTube** button.
- **Connected:** channel title + disconnect link, stat cards (replied today/7 days, failed, deferred, active rules), **quota meter** (progress bar: used / soft budget, "resets at <local time> (midnight Pacific)"), last poll time + status, **Poll now** button.
- Banners: *Reconnect YouTube* (needs_reauth), *Quota reached — replies deferred until reset*, *Comments disabled on <video>*, *Polling disabled*.

## 4. Videos (rules) list
Card per rule: thumbnail, title, **Shorts** badge when applicable, keyword chips, link (truncated), active toggle, counts (matched / replied / failed), last polled time, Edit.
Empty state: "No video rules yet. Add your first video."

## 5. New / Edit video rule
1. **Video picker:** grid of recent uploads (thumbnail, title, date, Shorts badge). Videos with an existing rule are disabled with "Has rule". Search filter on title (client-side). Fallback: paste a video URL or ID (parse `watch?v=`, `youtu.be/`, `shorts/`).
2. **Keywords:** chip input, max 10, lowercase preview.
3. **Match mode:** Whole word (default) / Exact comment / Contains, with examples.
4. **Link:** https URL input + "Test link".
5. **Reply variants:** 1–5 textareas (add/remove), variable chips (`{{link}}`, `{{author}}`, `{{keyword}}`), live preview bubble styled like a YouTube reply, counter (max 500 each). Helper text: "Variants are picked at random so replies are not identical."
6. **Backfill toggle** (off by default): "Also reply to existing comments from the last 7 days." Confirm dialog when turned on, showing the quota cost warning.
7. **Active** toggle. Save / Cancel / Delete.
Helper note under the link field: "YouTube may hold replies containing links for review. Test with a second account."

## 6. Activity
Same layout as Instagram activity. Statuses: **Posted, Failed, Deferred, Skipped**. Columns: time, author, comment (truncated), keyword, status, error (expandable), link to the comment on YouTube (`https://www.youtube.com/watch?v=<videoId>&lc=<commentId>`), Retry for failed/deferred < 7 days.

## 7. Settings
Channel (title, ID), connection status + **Reconnect** / **Disconnect**, quota (used, soft budget, resets at), polling info (interval, last run, summary), reply limits (hourly cap, delay range — read-only display of env values), module status (enabled/disabled).

## 8. States, a11y, performance
- Loading skeletons for picker; disabled buttons with spinner during OAuth redirect and poll-now.
- Toast messages as in Instagram UI. Destructive actions need confirmation.
- Tabs implemented as real links (`<nav>` + `<a aria-current="page">`), keyboard accessible, no JS required.
- Thumbnails: add `https://i.ytimg.com` (and `https://yt3.ggpht.com` for channel avatar) to CSP `img-src`; keep everything else strict. All YouTube-sourced text (titles, comments, names) is HTML-escaped.
- Works at 360 px; no horizontal scroll.
