# PROJECT KNOWLEDGE BASE

Rollout update (2026-10-15): Supabase resumed; release `51cf47e` was deployed and both production Langfuse prompts are version 2. Saved chat/feedback are Sol low with 1536/4096 output tokens. See `docs/production-rollout-2026-10-15.md`. Deployment verification exposed interrupted delete/reinsert message loss; 52 absent messages were restored from the private backup and all 526 historical messages matched. Ordinary saves now preserve message IDs and batch upsert, never delete/reinsert messages. New IDs are assigned before local JSON persistence; public message payloads remain role/content. Legacy ID-less fallback records require reconciliation before syncing to overlapping remote data. The older deployment-blocked and budget notes below are historical: current budget accounted $4.71340088, remaining $0.28659912, 621 calls/outcomes.

Latest validation/deployment note (2026-10-15): see `docs/persona-long-validation-2026-10-15.md`. Six Sol sessions reached 14–15 user turns (29–31 messages), ended on persona refusal, with six feedback reports; do not call this six 20-turn passes. Sol roleplay now uses explicit static cache boundaries; all canonical history remains. A later opening-only guard against inventing user actions was checked in three real starts, not a rerun of all long sessions. Final budget accounted $4.59768088 including retained uncertain reserve, remaining $0.40231912; journal 619 calls. Render production remains f98a88a: Supabase project is paused and resume was blocked by the two-free-project limit. No production deployment or prompt publication occurred; user must free a project slot, then preserve current fallback records before redeploying. Production Langfuse prompts are still version 1.

Generated: 2026-10-14 (Asia/Seoul) · Snapshot: `f98a88a` · Branch: `codex/persona`

## OVERVIEW

Korean mobile web app for practicing gospel conversations with AI personas and receiving feedback.
ES-module JavaScript: Node HTTP server, React 19, Vite 8, Tailwind 4; optional Supabase persistence and Langfuse prompts/tracing.

## STRUCTURE

```text
server.js           # HTTP routing, auth, persistence, model calls, prompt assembly
lib/                # Server-only Langfuse, token cost and conversation context helpers
src/                # React UI and controller; see src/AGENTS.md
prompts/            # Persona and feedback system-prompt file fallbacks
data/               # Persona definitions and exported Langfuse catalog
public/             # Both maintained static files AND Vite output
scripts/            # API/browser/model QA and Langfuse utilities
docs/               # Specs, SQL, deployment notes, agent playbook, QA evidence
```

## WHERE TO LOOK

| Task | Location | Coupling |
|------|----------|----------|
| API/auth/admin/account lifecycle | `server.js`: `handleAppApi`, `handleApi`, `requireUser`, `requireAdmin` | Client actions in `src/hooks/useAppController.js` |
| Conversation storage | `server.js`: `loadDb`, `saveDb`, `appConversationToSupabase`, `supabaseConversationToApp` | `docs/supabase-schema.sql`, `docs/launch-readiness-migration.sql` |
| Roleplay behavior | `server.js`: `roleplayPromptPartsFor`, `staticRoleplayPromptFor`, `chatDynamicPromptFor` | `prompts/persona-system-prompt.md`, `data/personas.json` |
| Feedback generation | `server.js`: `generateFeedbackWithQualityGate`, `feedbackStructureReport` | `prompts/feedback-prompt.md`, UI feedback rendering |
| Provider settings and usage | `server.js`: `callModelWithUsage`, provider adapters, `recordUsageEvent` | Admin settings, usage display, persisted settings |
| Prompt source/cache | `lib/langfuse-prompts.js`: `createPromptRegistry` | Remote prompt labels and local fallbacks |
| Tracing | `lib/langfuse-tracing.js`: `buildPersonaTraceContext`, `traceModelCall` | Server prompt assembly and provider usage results |
| Persona changes | `data/personas.json` | Server prompt formatting, UI image mapping, model QA, catalog export |
| PWA/static shell | `public/sw.js`, manifest/offline/legal pages, `src/main.jsx` | Install-prompt hook and browser cache behavior |
| Deployment | `render.yaml`, `Dockerfile`, `docs/deployment-guide.md` | Build output, server imports, production environment |

Code map above is source-verified. LSP servers and ast-grep were unavailable at generation; semantic reference centrality is unmeasured.

## CONVENTIONS

- Keep server helpers in the existing `server.js` organization; it is a native `node:http` app, not Express.
- Preserve the API contract across server routes, controller calls, and stored data mappings.
- Supabase uses server-side REST calls and camelCase/snake_case mapping helpers; schema changes must reach SQL documentation and both mapping directions.
- `saveDb` writes local JSON before attempting Supabase. Load failures can fall back to JSON; `storage/` is not durable Render production storage.
- `lib/` is backend code; `src/lib/` is browser code. Never import backend secrets or service-role credentials into `src/`.
- Session relationship/setting/goal IDs occur in both server label/policy maps and `src/lib/constants.js`; keep them aligned.
- Langfuse prompt names are `roleplay/persona-system` and `roleplay/feedback-system`; default label is `production`, with file fallback and a refresh cache.
- Editing a local prompt does not override an available remote prompt. Persona runtime-config seed entries are metadata; runtime assembly uses `server.js` and `data/personas.json`.
- Preserve the roleplay static/dynamic split: Anthropic caches static system blocks; OpenAI receives combined input. Local fallback prompt text is loaded at server startup.
- Feedback-format changes must align prompt Markdown, `requiredFeedbackHeadings`, `feedbackStructureReport`, `summarizeFeedback`, and repair instructions.
- User-move/PAS classification is duplicated in tracing metadata; inspect `lib/langfuse-tracing.js` when changing the server classification.
- Persistence uses an in-memory DB, whole JSON writes, and Supabase synchronization; do not assume transactional updates or multi-instance safety. Importing `server.js` starts the app rather than exposing pure helpers.
- Existing specialist workflow and role boundaries live in `docs/development-agent-playbook.md` and `docs/development-agents/`; consult for implementation work. Delegate only when allowed by the active session, and keep commit/push/merge with the main agent.
- Preserve meaningful diffs: avoid line-ending-only changes. For build commits, include only new bundles actually referenced by `public/index.html`.

## ANTI-PATTERNS

- Do not clear `public/`: Vite uses `outDir: "public"`, `publicDir: false`, and `emptyOutDir: false`; maintained assets coexist with bundles.
- Do not hand-edit hashed frontend bundles. Change `src/` and rebuild.
- Do not commit `.env`, `.env.*` secrets, or `storage/` (`.env.example` is intentionally tracked).
- Do not expose keys, session cookies, sensitive logs, or user dialogue transcripts in reports. Do not automatically alter/delete production data.
- Do not bypass existing CSRF, authentication, ownership, rate-limit, or usage-limit checks when extending routes.
- Do not equate a successful smoke exit with full QA: connection refusal is a successful SKIP, and `SMOKE_FULL=1` does not run chat tests.

## COMMANDS

Run from the repository root. In PowerShell, use `npm.cmd` if `npm` is blocked by execution policy.

```bash
npm ci
npm run build                          # Updates public/index.html and public/assets
npm start                              # Full app: http://127.0.0.1:4173 by default
npm run dev                            # Vite only; no API proxy configured
npm run check                          # node --check server.js + Vite build
npm test                               # Cost, context, feedback and install-policy regressions
npm run qa:persona:budget               # Offline prompt-size comparison against f98a88a
npm run qa:launch:local                 # Same script as qa:launch; see URL override caveat
npm run smoke                          # Existing server, /healthz only
```

- `check` does not execute unit tests; run `npm test` separately. No lint/typecheck script or tracked CI workflow exists.
- Paid evaluation: `scripts/qa-persona-live.mjs` requires `QA_LIVE=1` and `QA_ENV_FILE`. It keeps a cumulative $4 reservation ledger under `.omo/qa/live/`; never reset that ledger during an authorized budget window. Only synthetic conversations are sent; Supabase and Langfuse are not used by this harness.
- Without `QA_BASE_URL`/`SMOKE_URL`, launch QA starts a local server with temporary storage and Supabase disabled. With either override it targets that service; authenticated checks create data and delete their QA account.
- `npm run qa:walkthrough` needs a running server and Playwright, which is imported by the script but not declared in `package.json`; screenshots go to `docs/qa-screenshots/manual-session/`.
- Roleplay/Claude QA scripts make real model calls and may write records/reports. Inspect their environment, authentication, and target before running; they are not offline unit tests.
- `npm run langfuse:catalog` regenerates `data/langfuse-persona-catalog.json` from persona definitions.
- `npm run langfuse:seed` publishes prompts with the `production` label. `-- --dry-run` avoids publishing but still requires Langfuse environment configuration.

## RUNTIME NOTES

- Nonproduction startup loads `.env` without overwriting already-set environment variables; production does not load it.
- Production defaults to port `10000` and requires a session secret (OAuth secret fallbacks exist); use the explicit `SESSION_SECRET` deployment setting.
- Dev login is enabled outside production regardless of `ENABLE_DEV_LOGIN=false`; production should use `ENABLE_DEV_LOGIN=false`.
- Service worker registration occurs only in a production frontend build. Inspect `public/sw.js` when diagnosing stale static assets.
- Dockerfile now copies `lib/`; no container runtime verification has been performed.
- New installations default to `gpt-6.1-sol`, chat reasoning `low`, and 1536 output tokens. Existing environment overrides and saved admin settings remain authoritative. Local prompt improvements still require an explicitly managed Langfuse rollout when remote prompts are enabled.
- Purposeful evaluation uses `scripts/qa-persona-purposeful.mjs` and the central `lib/qa-budget.js` gate; legacy paid entry points refuse execution. Preserve imported legacy reservations and the current append-only budget. Read-only status: `node scripts/qa-purposeful-budget.mjs --status`.
- Task 7 ended `terminal_measured_incomplete`: no quality pass, winner or default change. Task 9 also ended known unmet: mini D1 delivered 2/3 required checkpoints; current U23 was mistaken for a past checkpoint. D2 and further paid work/repair are stopped; no memory pass/fail or coverage pass is inferred. Final journal: 301 reservations/301 outcomes, pending 0; $0.90526661 settled estimate + $0.3868478 retained uncertain reserve, $3.70788559 remaining under $5 (not permission to resume). See `docs/persona-model-evaluation-2026-10-15.md` and `task-9-terminal-comparison.json`; preserve task 7 as the earlier terminal snapshot.
- New-install feedback is `gpt-6.1-sol`/low/4096, including the semantic verifier, unless env/saved settings override it. Feedback permits at most two drafts and two verifiers; all attempts count toward cost. Never describe historical candidate feedback as a different production pipeline result.
- Config QA: `node scripts/qa-purposeful-contracts.mjs --case config` requires `QA_CONFIG_SDK_ROOT` pointing to a task-owned temporary @langfuse/client 5.3.0 installation; missing SDK fails closed. Product-v2 source/version/settings evidence is under `task-8-prep/product-v2/`; telemetry export remains untested.
- Local prompt fallback is captured at server startup; prompt-registry refresh does not reread changed local files. Current rollout payload/hash/rollback are local evidence only; no production prompt was published.
- Profile completion requires a 1–40 character name/nickname. Other profile fields are optional.
- The separately authorized 2026-10-15 repair is recorded in `docs/persona-repair-2026-10-15.md`; earlier task 7/9 terminal artifacts remain historical. Sol passed the same known attribution cases and a seven-turn gospel conversation, but full matrix/learning effectiveness remain unverified. Sol D1 recall was correct but controller v2 violated an earlier refusal, so no boundary-compliant coverage pass is claimed. Current controlled policy is v3, conservatively retaining earlier refusals; paid v3 coverage was not rerun. Final budget: 513 reservations/513 outcomes/pending 0, settled $2.74168623 + uncertain $1.01281555, remaining $1.24549822; never reset or release uncertain reservations.
