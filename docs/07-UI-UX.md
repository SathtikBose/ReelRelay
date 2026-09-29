# 07 — UI / UX (Admin Panel)

Server-rendered EJS, vanilla CSS, minimal vanilla JS. **Mobile-first** (the creator will often manage this from a phone). Single admin user.

## 1. Design tokens
| Token | Light | Dark |
|-------|-------|------|
| `--bg` | #F7F7FB | #0F1117 |
| `--surface` | #FFFFFF | #171A23 |
| `--text` | #14151A | #ECEEF5 |
| `--muted` | #6B7080 | #9AA0B4 |
| `--primary` | #6C5CE7 | #8B7CFF |
| `--success` | #16A34A | #22C55E |
| `--warning` | #D97706 | #F59E0B |
| `--danger` | #DC2626 | #EF4444 |
| `--border` | #E5E7EF | #262A36 |

- Font: system UI stack. Base 16 px, scale 12/14/16/20/24/32.
- Spacing scale 4/8/12/16/24/32. Radius 12 px cards, 8 px inputs. Tap targets ≥ 44 px.
- Respect `prefers-color-scheme` for dark mode. Contrast ≥ WCAG AA.

## 2. Layout
- Top bar: logo "ReelRelay", status dot (webhook/token health), logout.
- Mobile: bottom tab bar (Dashboard, Reels, Activity, Settings). Desktop ≥ 900 px: left sidebar.
- Content max-width 960 px.

## 3. Screens

### 3.1 Login
Password field, show/hide toggle, submit. Generic error "Incorrect password". Lockout message after rate limit.

### 3.2 Dashboard
- Stat cards: DMs sent (today / 7 days), Failed, Active rules, Token days left.
- Alert banners (top): token expires < 10 days, last refresh failed, recent auth errors.
- Recent activity (last 10 rows).
- Primary CTA: **+ New reel rule**.

### 3.3 Reels (rules list)
Card per rule: thumbnail, caption snippet, keyword chips, link (truncated), active toggle, counts (matched / sent / failed), Edit button.
Empty state: illustration-free text "No reel rules yet. Add your first reel." + CTA.

### 3.4 New / Edit rule
1. **Reel picker**: grid of recent reels (thumbnail + caption + date). Selecting fills `mediaId`. Fallback: manual media ID input if the API call fails. Reels already used show a "Has rule" badge and are disabled.
2. **Keywords**: chip input (Enter/comma to add), lowercase preview, max 10.
3. **Match mode**: segmented control — *Whole word* (default), *Exact comment*, *Contains*. Helper text with an example for each.
4. **Link**: URL input, must be https; "Test link" opens in new tab.
5. **DM template**: textarea with variable chips (`{{link}}`, `{{username}}`, `{{keyword}}`), live **preview bubble**, character counter (max 800).
6. **Active** toggle. Save / Cancel. Delete (with confirm dialog) on edit page.
Inline validation messages under each field; keep entered values on error.

### 3.5 Activity
Filter bar: status (All / Sent / Failed / Skipped), reel. Table on desktop, stacked cards on mobile: time, @username, comment text (truncated), keyword, status badge, error (expandable). "Retry" button on failed rows younger than 7 days. Pagination 25/page.

### 3.6 Settings
- Token: masked status, expires at, days left, last refresh result, **Refresh now**.
- Webhook info: callback URL (`BASE_URL/webhook`), verify token hint (not the value), copy buttons.
- App info: version, uptime, DB status.

## 4. States & feedback
- Loading: button spinners; picker skeleton cards.
- Success/error: flash toast messages (auto-hide 4 s, `role="status"`).
- Destructive actions require confirmation.
- Network failure in picker: inline error + manual entry fallback.

## 5. Accessibility & quality
- Semantic HTML, labels bound to inputs, visible focus rings, keyboard operable.
- All user-supplied text (captions, comments, usernames) HTML-escaped (EJS `<%= %>`, never `<%- %>` for user data).
- No external fonts/CDNs; strict CSP compatible (no inline scripts; use `/public/js/*.js`).
- Works at 360 px width; no horizontal scroll.

## 6. Default DM copy
`Hey {{username}}! 👋 Here's the link you asked for:\n{{link}}`
