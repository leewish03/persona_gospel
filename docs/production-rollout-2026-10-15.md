# Production rollout — 2026-10-15

The user resumed Supabase and authorized completion of the production deployment.

## Released configuration

- Initial release: `51cf47e05e9684674af33ef89cb1c17dd8d05715`, normal fast-forward push to `master`; Render auto-deploy and Blueprint deployment both succeeded.
- URL: https://gospel-conversation-simulator.onrender.com
- Google sign-in was exercised successfully; login remains enabled.
- Saved chat settings: OpenAI `gpt-6.1-sol`, low reasoning, 1536 output tokens.
- Saved feedback settings: OpenAI `gpt-6.1-sol`, low reasoning, 4096 output tokens.
- Langfuse `production`: `roleplay/persona-system` version 2 and `roleplay/feedback-system` version 2. The running server reported both versions from Langfuse.
- Persona prompt SHA256: `442caaf7a4e12bfe0018f0930a34b5a4fc05ef6443f24d29b40287961778bb60`.
- Feedback prompt SHA256: `8dd860318a63777d76d26c8fb1eea729fbe317bd004f3aa12bef3c6036e05c19`.

## Preservation and discovered storage defect

Before deployment, a private, gitignored backup captured 10 users, 32 conversations, 526 messages, 307 usage events, operations settings and both previous prompt versions. Backup SHA256: `463bfda564a4645cf03b51bb76f4757f58b6db0e47a07c72cce348ea4ec765b9`. No private records are included in this report.

The old running process had zero conversations in fallback memory. After deployment, the application loaded the 32 historical conversations from Supabase. Subsequent exact message comparison found the pre-existing delete/reinsert persistence defect: writes used one 10-second deadline and could leave a conversation without messages if interrupted between deletion and insertion. Two historical conversations lost 52 messages during rollout/saves. All 52 absent message positions were restored from the backup without replacing conflicting or new data; all 526 original message contents were then present, plus 3 synthetic smoke messages. Historical feedback bodies were preserved; one previously empty derived summary was populated by the existing mapper.

Persistence repair preserves loaded message IDs, assigns new IDs before writing the local fallback, and uses one conflict-ID message upsert without deleting historical rows. Three real local HTTP regressions cover interrupted insertion, a lost response after commit, retries/restarts, batching and the unchanged public message shape. All 91 tests passed; `npm run check` and patch whitespace checks passed.

Final release `df6e2eeb746bb6f01afa8c3cf5b630bd164fedc8` is Live on Render deployment `dep-db85stss728c73fndl0g`. After restart, the existing login still worked. An actual admin settings save returned success; the subsequent 2026-10-15 05:04 UTC comparison preserved every original conversation, all 526 message contents and historical feedback bodies. Totals are 10 users, 33 conversations, 529 messages and 309 usage events, including the synthetic production smoke. Health returned 200; served bundle `/assets/index-Crt1_oYv.js` contained the new UI/model markers. Detailed non-sensitive verification is in `.omo/evidence/deploy-2026-10-15/verification.json`.

## Production smoke and budget

A real synthetic Kim Sihyun session produced an opening and one reply with Sol. The persona requested a break from application deadlines; when the user respected that boundary and asked about enjoyable activities, the reply stayed with coffee, conversation and dessert. This confirms production model connectivity and that short context, not long-term learning effectiveness.

Two calls were reserved through the existing append-only central budget before UI execution. Production usage rows reported 4695/45 and 5413/55 input/output tokens. Because those rows omit raw cache breakdowns, the full $0.11572 reservation remains conservatively accounted rather than released from rounded cost estimates.

- Journal: 621 reservations and outcomes; no pending production smoke outcomes.
- Settled estimate: $3.58486533.
- Retained uncertain reserve: $1.12853555.
- Total accounted: $4.71340088; remaining: $0.28659912 under the $5 cap.

Six long sessions and six feedback reports were validated before deployment; see `persona-long-validation-2026-10-15.md`. They reached 14–15 user turns and ended at refusal, not six 20-turn passes. Production feedback generation was not repeated after rollout. Docker execution and multi-instance storage safety remain unverified; Render uses its native Node build.
