# 03 — Tech Stack

All choices are free-tier compatible.

## 1. Runtime & framework
| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20 LTS | Native `fetch`, stable, Render-supported |
| Web framework | Express 4 | Simple, well-known, easy raw-body handling |
| Language | JavaScript (CommonJS) | Fast to iterate; JSDoc for types |
| Templates | EJS + vanilla CSS/JS | Server-rendered admin, no build step |
| Database | MongoDB Atlas M0 (free) | User choice; 512 MB is plenty |
| ODM | Mongoose 8 | Schemas, validation, indexes |
| HTTP client | Native `fetch` + `AbortController` | No extra dependency |

## 2. Libraries
| Package | Purpose |
|---------|---------|
| `zod` | Env + request/webhook validation |
| `pino`, `pino-http` | Structured logging, request logs |
| `helmet` | Security headers / CSP |
| `express-rate-limit` | Login and API throttling |
| `cookie-session` | Signed, httpOnly session cookie |
| `csrf-csrf` | CSRF protection for admin forms |
| `express-mongo-sanitize` | Strip `$`/`.` operators from input |
| `node-cron` | Daily token-refresh check |
| `p-queue` | In-process queue with concurrency limit |
| `dotenv` | Load `.env` locally |
| `ejs` | Templates |

## 3. Dev tooling
| Tool | Purpose |
|------|---------|
| `jest`, `supertest` | Unit + integration tests |
| `mongodb-memory-server` | Real MongoDB in tests, no Atlas needed |
| `nock` or Jest fetch mock | Mock Instagram API |
| `eslint` (+ `eslint-plugin-security`), `prettier` | Lint / format |
| `nodemon` | Local dev reload |
| `husky` + `lint-staged` (optional) | Pre-commit lint |

## 4. Infrastructure (free)
| Service | Use |
|---------|-----|
| Meta for Developers | App, webhooks, Instagram API |
| MongoDB Atlas M0 | Database |
| Render (free web service) | Hosting; ephemeral disk, spins down after 15 min idle |
| UptimeRobot (free) | Pings `/health` every 5 min |
| Cloudflare Tunnel or ngrok | Public HTTPS URL for local testing |
| GitHub | Source hosting, Render auto-deploy |

## 5. npm scripts (required)
```
dev        nodemon src/server.js
start      node src/server.js
lint       eslint .
format     prettier --write .
test       jest --runInBand
test:watch jest --watch
seed:rule  node scripts/seedRule.js
smoke      node scripts/smoke.js
```

## 6. Environment variables
| Name | Required | Description |
|------|----------|-------------|
| `NODE_ENV` | yes | `development` / `test` / `production` |
| `PORT` | no | Default 3000 (Render injects its own) |
| `BASE_URL` | prod | Public URL of the service |
| `MONGODB_URI` | yes | Atlas connection string |
| `IG_APP_ID` | yes | Meta app ID |
| `IG_APP_SECRET` | yes | Webhook signature verification |
| `IG_VERIFY_TOKEN` | yes | Random string used in webhook handshake |
| `IG_USER_ID` | yes | Instagram professional account ID |
| `IG_ACCESS_TOKEN` | first run | Bootstraps the encrypted token stored in DB |
| `IG_API_VERSION` | no | e.g. `v23.0`; use the current stable version (**VERIFY**) |
| `ADMIN_PASSWORD` | yes | Admin login password (min 12 chars) |
| `SESSION_SECRET` | yes | 32+ random chars |
| `CSRF_SECRET` | yes | 32+ random chars |
| `ENCRYPTION_KEY` | yes | 64 hex chars (32 bytes) for AES-256-GCM |
| `LOG_LEVEL` | no | `info` default |
| `LOG_TTL_DAYS` | no | Default 60; ReplyLog TTL |

Generate secrets with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 7. Version policy
Pin exact versions in `package-lock.json`. Run `npm audit` in Phase 7. Node version pinned via `engines` in `package.json` and `.nvmrc`.
