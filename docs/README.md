# ReelRelay — Project Docs

**ReelRelay** turns Instagram reel comments into DMs. You set a keyword and a link per reel; when a viewer comments that keyword, ReelRelay privately replies with your link. Zero cost to run: Node.js + MongoDB Atlas free tier + Render free tier + UptimeRobot.

## Read order (for humans and the AI agent)

| # | File | Purpose |
|---|------|---------|
| 0 | `AGENT-RULES.md` | Non-negotiable working rules for the build agent |
| 1 | `01-PRD.md` | What we are building and why |
| 2 | `02-ARCHITECTURE.md` | System design, flow, folder structure |
| 3 | `03-TECH-STACK.md` | Exact technologies, packages, env vars |
| 4 | `04-DATABASE-SCHEMA.md` | MongoDB collections, indexes, models |
| 5 | `05-API-SPEC.md` | Internal routes + Instagram API contracts |
| 6 | `06-META-SETUP.md` | Manual Meta developer app setup (done by the human) |
| 7 | `07-UI-UX.md` | Admin panel screens and design system |
| 8 | `08-SECURITY.md` | Threat model and required mitigations |
| 9 | `09-BUILD-PHASES.md` | Phase-by-phase plan, tests, commit messages, status table |
| 10 | `10-DEPLOYMENT.md` | Local tunnel + Render + Atlas + UptimeRobot |
| 11 | `11-TESTING.md` | Test strategy and definition of done |

## Workflow in one line
Build one phase → lint + test + build → commit → report → **wait for the human to type `next`**.

## Conventions
- Node.js 20 LTS, CommonJS, Express, Mongoose.
- Conventional Commits. Tag each finished phase `phase-N`.
- Never commit secrets. `.env` is git-ignored; `.env.example` is committed.
- Items marked **VERIFY** depend on Meta's current docs/dashboard and must be confirmed during the phase that uses them.
