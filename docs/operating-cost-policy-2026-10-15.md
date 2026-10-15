# Operating cost policy — 2026-10-15

User direction: retain Sol and natural practice, protect the monthly operating budget, and impose no per-user usage quotas. The earlier proposed daily 3/90/3 and 30-turn limits were withdrawn before rollout.

## Policy

- Chat and feedback remain `gpt-6.1-sol`, reasoning `low`, with existing output allowances (1536 and 4096 respectively).
- Global monthly estimated model budget: KRW 50,000. At 90% (KRW 45,000), new training starts stop; ongoing dialogue and feedback may use the remaining budget. This reserve is shared and does not guarantee completion of every open session.
- Daily starts, chat messages, feedback reports and app feedback quotas are disabled (`0`). No arbitrary conversation turn ceiling. Provider context capacity and existing request security/rate protections remain.
- Each model call reserves a conservative input/output cost before dispatch. Concurrent calls include pending reservations. Known provider usage settles the same event; unknown failures retain their upper bound. Feedback drafts, repairs and semantic verifiers each count.
- Durable usage accounting must be available before a paid call is sent. Reservations survive process restart; usage history must not be truncated in a way that drops current-month spending.
- Fixed Sol instructions use explicit prompt-cache boundaries. Dynamic conversation and feedback content remain outside the cached prefix; canonical conversation history is preserved. Cache misses are included in the reservation, so savings are not assumed for admission.

## Scope and limits

This is an application-level estimate for this service, not an OpenAI billing-account hard limit. Exchange rates, provider price changes, taxes and API calls outside this service can differ from the displayed estimate. Admission is designed for the current single application process; shared atomic admission is required before running multiple application instances.

The existing paid-evaluation ledger is separate and is not reset or charged by offline tests. No new paid conversation is necessary to verify quota and concurrency handling with mocked provider responses.

Production setting changes preserve all AI settings and existing records. The pre-change settings snapshot is stored privately under `storage/release-backups/`, never committed.

## Validation

- Offline suite: 104 tests passed, zero failures/skips. Real loopback HTTP fixtures exercise budget rejection before provider dispatch, concurrent reservations, unknown failures, failed reservation persistence, feedback beyond the new-start threshold, feedback retry accounting, unavailable startup ledger, unlimited personal usage and preserved history beyond 500 turns.
- Usage pagination fixture loads 6,017 rows, covering the former 5,000-event truncation and PostgREST page limit.
- Payload tests verify fixed-only Sol caching for roleplay, feedback and verifier, with complete dynamic content and unchanged non-Sol requests.
- `npm run check` passed (server syntax and Vite production build); `git diff --check` passed.
- Main-session review checked API callers, usage-row serialization, foreign-key timing, feedback error paths, zero-as-unlimited display, and existing history persistence regressions. No blocking issue remained in this scope.

Production deployment and rendered settings verification follow the tested change.
