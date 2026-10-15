# FRONTEND KNOWLEDGE BASE

Scope: `src/`. Root guidance applies; this file covers browser-side ownership and change coupling.

## WHERE TO LOOK

| Concern | Owner | Key contract |
|---------|-------|--------------|
| Entry | `main.jsx` | StrictMode render and production-only service worker registration |
| Screen dispatch and shared shell | `App.jsx`: `App`, `AppShell`, `TabBar` | Explicit screen selection; no router library |
| Training/account/history/admin state | `hooks/useAppController.js`: `useAppController` | Returns `{ state, actions }` consumed by screens |
| Navigation and confirmations | Controller: `goTo`, `previousScreen`, pending-action handling | Preserve active-training guards and destructive confirmations |
| HTTP and API errors | `lib/api.js` | `getJson`, `postJson`, `putJson`, `deleteJson`; errors carry status/code/serverMessage |
| Screen labels and assets | `lib/constants.js` | Flow/setup arrays, screen metadata, context enums, image maps |
| Feedback display | `lib/format.js`: `markdownToHtml`; `App.jsx` feedback/history/admin views | Escaped HTML and `.feedback-content` styles |
| Beginner training | `lib/trainingGuides.js`; controller `prepareBeginnerSession` | Same session IDs as server; no model calls for help |
| Feedback takeaway | `lib/feedbackTakeaway.js`; `App.jsx`: `FeedbackScreen` | Extract first next-task item; retain full report and fallback |
| Shared controls | `components/ui/` | Existing Radix/shadcn-style JSX primitives; `cn` from `lib/utils.js` |
| Theme and mobile layout | `index.css`, `AppShell`, `TabBar` | OKLCH tokens, viewport/keyboard variables, safe areas |
| Install prompt | `hooks/usePwaInstallPrompt.js`, `lib/pwaInstallPrompt.js` | Browser integration separated from pure decision/state logic |

## CONVENTIONS

- Use `@/` imports for source modules; the alias is configured in both Vite and `jsconfig.json`.
- Keep app transitions, persistence requests, and session lifecycle in the controller. Presentation/form state can remain inside screen components.
- Extend the existing `{ state, actions }` contract when wiring a screen; check both the return object and its callers.
- Reuse local UI primitives, `cn`, semantic theme classes, and Lucide icons. User-facing labels and errors are Korean.
- Route JSON mutations through `lib/api.js` to retain CSRF headers. Map failures through `userMessageForError` in the controller.
- Keep the current mobile shell and theme; the existing frontend playbook forbids arbitrary redesign and nested card-in-card layouts.

## CHANGE CHECKLIST

- New screen: update App dispatch, controller navigation/actions, `screenMeta`, applicable flow/setup arrays, and shell/tab visibility conditions.
- Context option: update label maps AND controller random-selection arrays; check the matching server IDs/policies.
- Persona/image change: check `/data/personas.json` loading and `personaImages`/`settingImages` mappings.
- Feedback change: inspect live feedback, history detail, admin detail, export formatting, and `.feedback-content` styling together.
- Model-setting change: align `normalizeAdminSettings`/`ModelSettingsCard`/`AdminSettings`, controller payloads, and server sanitizers.
- Install-prompt change: keep policy in `lib/pwaInstallPrompt.js`, browser events/storage in the hook, and completion/chat signals in the shell. Preserve the seven-day dismissal cooldown and training-completion behavior unless deliberately changing policy.
- Mobile layout change: inspect `--app-vvh`, `--keyboard-inset`, safe-area padding, overflow rules, and the 480px shell width together.

## ANTI-PATTERNS

- Do not bypass busy/typing guards, confirmation dialogs, feedback retry, or conversation resume when adding actions.
- Do not render model Markdown as raw HTML: retain escaping in `markdownToHtml` before `dangerouslySetInnerHTML`.
- Do not show internal provider/runtime errors directly to the user.
- Do not remove accessible labels casually; walkthrough QA uses `nav[aria-label="하단 내비게이션"]`.

## CHECKS

- Run `npm test` from the repository root for install policy, takeaway extraction and backend regressions.
- Use root build/check commands for JSX changes; they do not replace flow validation.
- For changed UI flows, check mobile and desktop loading, empty, error, success, keyboard, and drawer states. Browser walkthrough prerequisites are documented in the root guide.
