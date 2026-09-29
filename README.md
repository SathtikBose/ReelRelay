# ReelRelay

> Instagram comment-to-DM automation tool (Node.js + Express + MongoDB Atlas).

## Overview
ReelRelay automates private DM replies with links whenever viewers comment specific keywords on your Instagram Reels.

## Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0
- MongoDB Atlas (M0 free tier cluster) or local MongoDB instance
- Meta Developer App with Instagram API setup (see `docs/06-META-SETUP.md`)

## Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment configuration file:
   ```bash
   cp .env.example .env
   ```

3. Fill in the required environment variables in `.env` (refer to `docs/03-TECH-STACK.md` and `docs/06-META-SETUP.md`).

## Available Scripts
- `npm run dev`: Start development server with automatic restart via nodemon.
- `npm start`: Start production server.
- `npm run lint`: Run ESLint across codebase.
- `npm run format`: Format codebase with Prettier.
- `npm test`: Run test suite with Jest.
- `npm run test:watch`: Run Jest in watch mode.
- `npm run seed:rule`: CLI tool to seed reel rules.
- `npm run smoke`: Run smoke check against live/deployed service.

## Project Structure
Detailed documentation is available in `/docs`:
- `docs/01-PRD.md`: Product requirements and scope
- `docs/02-ARCHITECTURE.md`: Architecture and system design
- `docs/03-TECH-STACK.md`: Technology stack and configuration
- `docs/04-DATABASE-SCHEMA.md`: Data models and indexing
- `docs/05-API-SPEC.md`: API specifications
- `docs/06-META-SETUP.md`: Meta Developer App setup
- `docs/07-UI-UX.md`: Admin UI specification
- `docs/08-SECURITY.md`: Security controls and threat model
- `docs/09-BUILD-PHASES.md`: Development phases and milestones
- `docs/10-DEPLOYMENT.md`: Free-tier deployment instructions
- `docs/11-TESTING.md`: Test strategy and quality gates

## Privacy
Stores minimal commenter data (IGSID, username, truncated comment snippet) with an automatic 60-day TTL index.
