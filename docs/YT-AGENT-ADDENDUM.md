# YouTube Module — Agent Addendum

These rules **add to** `/docs/AGENT-RULES.md`. If they conflict, the stricter rule wins.

1. **Read the existing code first.** The Instagram side is already built. Read `src/` and tests before changing anything. Match its patterns (app factory, zod env, pino logger, p-queue, Mongoose models, EJS views, CSRF, cookie-session).
2. **Do not break Instagram.** All existing tests must stay green in every phase. Instagram behaviour must be identical after refactors.
3. **Reuse, do not copy.** Import shared modules (`matcher`, `template`, `crypto`, `queue`, `logger`, `errors`, middleware). If a shared module needs a small generalization, change it with tests and keep its API backward compatible.
4. **Namespace everything YouTube.** Code under `src/youtube/`, routes under `/admin/youtube/*`, collections prefixed `yt_`, env vars `GOOGLE_*` / `YT_*`, views under `src/views/youtube/`.
5. **Tags and commits.** Tag `yt-phase-N`. Commit scope `youtube` (or `admin` for the tab shell), Conventional Commits.
6. **Status table.** Update the table in `YT-09-BUILD-PHASES.md` after each phase.
7. **No paid services, no new heavy dependencies.** Use native `fetch` for Google endpoints. Ask before adding any package.
8. **Never invent Google/YouTube behaviour.** If an API detail marked **VERIFY** is uncertain, check Google's current docs or ask me, then record the finding.
9. **Secrets.** Never log or commit Google client secret, auth codes, access tokens or refresh tokens.
10. **Phase discipline.** Build only the phase requested, then stop and wait for `next`.
