# Agent Rules (read first, follow always)

You are the build agent for **ReelRelay**. The human owns the Meta account, secrets and final approval.

## 1. Phase discipline
1. Read all of `/docs` before writing code. Source of truth for scope is `09-BUILD-PHASES.md`.
2. Build **only the phase you were told to build**. Never start the next phase on your own.
3. A phase is done only when: `npm run lint` passes, `npm test` passes, `npm run build`/`npm start` boots cleanly, and the phase's acceptance checklist is satisfied.
4. After the phase, commit, tag, update the status table in `09-BUILD-PHASES.md`, send the report (section 4), then **STOP and wait for the human to reply `next`**.
5. If tests fail, fix them. Do not commit red builds. Do not delete or weaken tests to get green.

## 2. Git rules
- Repo initialized in Phase 1 on branch `main`.
- Commit at every stable, green state (minimum one commit per phase). Then tag: `git tag phase-N`.
- Use **Conventional Commits**: `type(scope): imperative summary` (≤ 72 chars), blank line, body explaining *what and why*, optional footer `Tests: <what ran>`.
- Allowed types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`.
- One logical change per commit. No "wip", "update", "fix stuff".
- Never commit `.env`, tokens, keys, `node_modules`, or logs.

## 3. Code standards (production-ready)
- Node.js 20, CommonJS, async/await, no callbacks.
- Validate all external input (env, webhook payloads, request bodies) with `zod`.
- No `console.log`; use the `pino` logger. Never log tokens, secrets or full comment text of other users beyond what the schema stores.
- Every external call (Instagram API, MongoDB) has timeout + error handling.
- Small modules, single responsibility, JSDoc on exported functions.
- Follow the folder structure in `02-ARCHITECTURE.md`. Do not add libraries not listed in `03-TECH-STACK.md` without asking.
- Security requirements in `08-SECURITY.md` are mandatory, not optional.

## 4. Phase report format (send after each phase)
1. **Phase N — name: COMPLETE**
2. What was built (short bullets)
3. Files added/changed
4. Test results (counts + command output summary)
5. Commit hash(es) and tag
6. **Manual steps for the human** (if any, with exact instructions)
7. Known limitations / VERIFY items resolved or open
8. Final line: `Reply "next" to start Phase N+1 — <name>.`

## 5. Secrets and honesty
- Never invent credentials, IDs, tokens or API behaviour. If a value is needed, ask the human and reference `.env.example`.
- If Meta's real behaviour differs from these docs, say so, propose a fix, and update the relevant doc after approval.
- If a requirement is ambiguous or blocked, stop and ask instead of guessing.

## 6. Scope guard
- Free-tier only. Do not introduce paid services.
- Single-admin tool for one Instagram account. No multi-tenant features.
- You may edit `/docs` only to update the status table and to record human-approved corrections.
