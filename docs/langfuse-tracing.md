# Langfuse tracing (Persona Gospel)

Installed skill: `.agents/skills/langfuse` (from [langfuse/skills](https://github.com/langfuse/skills)).

## What gets traced

Every `/api/start`, `/api/chat`, `/api/feedback`, and admin opening-line batch call creates:

```text
Trace (Sessions view groups by conversationId)
└─ span: persona-gospel/{eventType}     ← turn-level
   └─ generation: llm-completion        ← model, tokens, prompt link
```

| Trace input | User message (or “session start”) |
| Trace output | Assistant reply |
| Generation input | User message + short dynamic preview (not full system prompt unless opted in) |

## Tags (filter in Langfuse UI)

- `feature:roleplay` | `feature:feedback` | `feature:opening-lines`
- `persona:kim-sihyun` …
- `goal:*`, `setting:*`, `relationship:*`
- `user_move:god_love` …
- `provider:openai` | `provider:anthropic`

## Environment variables

```text
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_TRACING_ENABLED=true
LANGFUSE_TRACE_FULL_PROMPT=false   # true = full dynamic prompt in generation span
```

## Verify

1. `GET /healthz` → `"langfuseTracing": true`
2. One training turn in the app
3. Langfuse → **Tracing** → open trace → see nested `llm-completion` with model + tokens
4. Langfuse → **Sessions** → same `conversationId` groups turns

Admin: `GET /api/admin/langfuse-prompts` includes `tracingEnabled`.

## Scripts

Long-running scripts should flush before exit:

```javascript
import { flushLangfuse, shutdownLangfuse } from "./lib/langfuse-tracing.js";
await flushLangfuse();
await shutdownLangfuse();
```
