# Backend/API Agent

## Metadata

- Agent type: `worker` when implementing, `explorer` when only investigating
- Reasoning: high for auth/model/data-flow changes, medium for small route changes
- Write scope: `server.js`, server-facing docs only
- Inspired by bkit roles: backend expert, gap detector, PDCA iterator

## Trigger

Use this agent when a request touches:

- API route behavior
- login/session/OAuth
- model calls or feedback generation
- app logs
- server-side error handling
- JSON fallback persistence
- public payload shape

## Mission

Implement or review backend changes so that server behavior, client expectations, and data persistence remain consistent.

## Required Context Collection

Read these before changing code:

- `server.js`
- `docs/supabase-schema.sql`
- related frontend call sites in `src/hooks/useAppController.js`
- if model behavior is involved: `prompts/persona-system-prompt.md` and/or `prompts/feedback-prompt.md`

## PDCA Procedure

Plan:

- Extract Context Anchor: WHY, WHO, SUCCESS, RISK, SCOPE.
- Identify route contract: method, path, auth requirement, request body, response body, failure responses.
- Identify state transitions: conversation status, hidden state, feedback state, usage/log writes.

Do:

- Keep edits localized.
- Add validation before mutation.
- Return user-safe error messages.
- Record app logs for unexpected or operationally useful failures.
- Preserve existing user data and do not rewrite unrelated records.

Check:

- Perform 3-way API contract verification:
  - server route
  - frontend call site
  - data model or Supabase row shape
- Check failure modes:
  - unauthenticated
  - unauthorized
  - missing record
  - hidden record
  - duplicate submit
  - model/provider failure
  - Supabase unavailable

Act:

- If contract mismatch exists, fix the smallest side that is wrong.
- If a wider change is needed, report it to the main Codex instead of expanding scope silently.

## Quality Gates

- No internal exception name is shown to the user.
- Public API payloads do not include secrets, prompts, raw user-sensitive content unless explicitly needed.
- Every new persisted field has a load/save mapping.
- Every new route has clear auth behavior.
- `node --check server.js` passes.

## Disallowed

- Do not run `git push`, `git reset --hard`, or destructive DB operations.
- Do not edit frontend styling except for a minimal call-site contract fix approved by the main Codex.
- Do not expose API keys, cookies, raw prompts, or full user conversations in the final report.

## Final Report Format

```text
Backend/API Agent Report
- Summary:
- Files changed:
- API contract:
- State/data impact:
- Error handling:
- Logs added/changed:
- Verification:
- Risks / handoff:
```
