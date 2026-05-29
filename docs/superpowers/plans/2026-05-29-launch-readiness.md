# Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimum launch-ready layer for privacy, cost control, PWA packaging, security hardening, operational feedback, and regression QA.

**Architecture:** Keep the existing Node single-server and React mobile web app. Add low-risk server guards, user-facing privacy actions, PWA metadata/assets, admin feedback state management, and QA scripts without changing the core roleplay model pipeline.

**Tech Stack:** Node.js ESM, React 19, Vite, Supabase REST schema, Render, browser/PWA assets.

---

### Task 1: Account Lifecycle And Privacy

**Files:**
- Modify: `server.js`
- Modify: `src/hooks/useAppController.js`
- Modify: `src/App.jsx`
- Modify: `docs/supabase-schema.sql`

- [ ] Add `DELETE /api/me` to anonymize the current user, hide conversations, detach operational records, clear the session, and block existing sessions for disabled users.
- [ ] Add `GET /api/me/export` to return the current user's profile, conversations, feedback, usage summary, and app feedback metadata.
- [ ] Add settings UI actions for "내 데이터 내보내기" and "계정 삭제".
- [ ] Update Supabase schema docs for `deleted_at`, feedback status fields, and usage provider.

### Task 2: Usage Guardrails

**Files:**
- Modify: `server.js`
- Modify: `src/hooks/useAppController.js`
- Modify: `src/App.jsx`
- Modify: `.env.example`

- [ ] Add default and env-backed limits for daily starts, daily chat messages, daily feedback generations, app feedback submissions, and global monthly KRW budget.
- [ ] Enforce limits before `/api/start`, `/api/chat`, `/api/feedback`, and `/api/app-feedback`.
- [ ] Return `429` with code `USAGE_LIMIT_REACHED` and user-readable Korean copy.
- [ ] Show remaining quota summary in settings and friendly limit messages in the UI.

### Task 3: PWA And App Packaging Prep

**Files:**
- Modify: `index.html`
- Create: `public/manifest.webmanifest`
- Create: `public/offline.html`
- Create: `public/sw.js`
- Create: `public/assets/app-icon-192.png`
- Create: `public/assets/app-icon-512.png`
- Modify: `src/main.jsx`
- Modify: `server.js`

- [ ] Add manifest, icons, apple touch icon, theme color, and service worker registration.
- [ ] Cache only app shell/assets and never cache `/api/*`.
- [ ] Serve fingerprinted static assets with long-cache and HTML/API with no-store.

### Task 4: Security And Ops Hardening

**Files:**
- Modify: `server.js`
- Modify: `src/lib/api.js`
- Modify: `.env.example`

- [ ] Require `SESSION_SECRET` in production unless explicitly disabled for local-only testing.
- [ ] Add request body size cap.
- [ ] Add security headers for JSON, redirects, and static files.
- [ ] Add double-submit CSRF token for mutating `/api/*` routes.
- [ ] Add rate limiting for mutating API requests.

### Task 5: Feedback Operations And QA

**Files:**
- Modify: `server.js`
- Modify: `src/App.jsx`
- Modify: `src/hooks/useAppController.js`
- Create: `scripts/qa-launch-readiness.mjs`
- Modify: `package.json`

- [ ] Add feedback category and status fields.
- [ ] Add admin feedback status update endpoint and UI controls.
- [ ] Add launch readiness QA script that checks auth, CSRF, app feedback, account export/delete, and PWA static files.
- [ ] Run `node --check server.js`, `npm run check`, and `npm run qa:launch`.
