# Development Agents

이 디렉터리는 Codex에서 하위 에이전트를 나눠 사용할 때 복사해 쓰는 역할 프롬프트를 담는다.

이 구성은 `popup-studio-ai/bkit-claude-code`의 방식을 이 프로젝트에 맞게 차용했다.

- bkit식 핵심: PDCA, specialist agent, quality gate, gap detection, QA L1-L5, context anchor
- 우리 프로젝트식 적용: `server.js`, React 단일 앱, Supabase, Render, 복음 전도 훈련 UX
- 원칙: bkit 원문을 그대로 실행하지 않고, Codex의 `spawn_agent`/로컬 도구에 맞는 작업 지시로 변환한다.

참고한 bkit 공개 자료:

- https://github.com/popup-studio-ai/bkit-claude-code
- https://github.com/popup-studio-ai/bkit-claude-code/tree/main/agents
- https://github.com/popup-studio-ai/bkit-claude-code/blob/main/agents/gap-detector.md
- https://github.com/popup-studio-ai/bkit-claude-code/blob/main/agents/qa-lead.md
- https://github.com/popup-studio-ai/bkit-claude-code/blob/main/agents/pdca-iterator.md

## Agent Files

- `backend-api-agent.md`
- `frontend-ux-agent.md`
- `supabase-data-agent.md`
- `qa-regression-agent.md`

## Default Orchestration

1. 메인 Codex가 요구사항을 Context Anchor로 정리한다.
2. API/DB/UI 영향을 나누어 필요한 에이전트를 병렬로 띄운다.
3. 각 에이전트는 자신의 파일 범위와 산출물만 책임진다.
4. 메인 Codex가 결과를 통합하고 diff를 검토한다.
5. QA/Regression Agent가 L1-L5 관점으로 최종 검증한다.
6. 메인 Codex만 커밋, 푸시, master 병합을 수행한다.

## Context Anchor Template

```text
Feature:
WHY:
WHO:
SUCCESS:
RISK:
SCOPE:
OUT OF SCOPE:
FILES LIKELY TO CHANGE:
QUALITY GATES:
```

## Quality Gate Defaults

- API contract: server route, client call, data model이 같은 URL/method/request/response를 말해야 한다.
- Behavioral completeness: loading, success, empty, validation, auth, permission, server error를 처리해야 한다.
- UX fidelity: 모바일에서 잘림/겹침/무한 스크롤 막힘이 없어야 한다.
- Data integrity: Supabase row, local app model, public API payload가 서로 매핑되어야 한다.
- Runtime: `node --check server.js`, `npm.cmd run check` 통과가 기본이다.
