# Development Agent Playbook

이 문서는 앞으로 기능 개발을 진행할 때 사용할 4개 기본 개발 에이전트 역할과 오케스트레이션 규칙을 정의한다.

구체적인 하위 에이전트 프롬프트는 `docs/development-agents/`에 둔다.

- `docs/development-agents/backend-api-agent.md`
- `docs/development-agents/frontend-ux-agent.md`
- `docs/development-agents/supabase-data-agent.md`
- `docs/development-agents/qa-regression-agent.md`

이 구조는 `popup-studio-ai/bkit-claude-code`의 PDCA, specialist agent, gap detection, QA gate 방식을 이 저장소에 맞게 변환한 것이다. bkit 원문을 그대로 실행하지 않고 Codex의 하위 에이전트 작업 단위에 맞춘다.

참고:

- https://github.com/popup-studio-ai/bkit-claude-code
- https://github.com/popup-studio-ai/bkit-claude-code/tree/main/agents
- https://github.com/popup-studio-ai/bkit-claude-code/blob/main/agents/gap-detector.md
- https://github.com/popup-studio-ai/bkit-claude-code/blob/main/agents/qa-lead.md

기본 원칙:

- 메인 Codex가 요구사항, 최종 판단, 통합, 커밋, 병합을 책임진다.
- 하위 에이전트는 명확한 역할과 파일 범위를 받아 병렬로 조사하거나 패치한다.
- 하위 에이전트는 사용자 변경을 되돌리지 않는다.
- 민감한 사용자 대화, 프롬프트 원문, API 키, 세션 쿠키를 최종 보고에 노출하지 않는다.
- 코드 변경 에이전트는 변경 파일을 최종 보고에 명시한다.
- QA 에이전트는 구현자가 아니라 깨뜨리는 관점으로 본다.

## 1. Backend/API Agent

담당 범위:

- `server.js`
- 인증, 세션, OAuth callback
- `/api/*` 라우트
- 모델 호출, 피드백 생성, 사용량 기록
- 오류 로그 저장과 사용자 친화 오류 응답
- JSON fallback 저장과 Supabase 저장 경계

먼저 읽을 파일:

- `server.js`
- `docs/supabase-schema.sql`
- 관련 요청이 있으면 `prompts/*.md`

맡길 일:

- API 추가/수정
- 서버 오류 원인 분석
- 피드백 생성 실패 처리
- 완료/숨김/삭제 상태 전이 검토
- 사용자에게 내부 오류명이 노출되는 경로 점검
- 서버 로그가 충분히 남는지 검토

금지할 일:

- 프론트 UI를 임의로 재설계
- Supabase 운영 데이터 직접 삭제
- API 키나 민감 로그 출력
- 사용자 대화 전문을 보고에 붙여넣기

산출물:

- 변경 파일 목록
- API 동작 요약
- 상태 전이 영향
- 실행한 검증 명령
- 남은 위험

## 2. Frontend/UX Agent

담당 범위:

- `src/App.jsx`
- `src/hooks/useAppController.js`
- `src/components/ui/*`
- 사용자 흐름, 모바일 UI, 관리자 UI
- 오류 메시지, 버튼 상태, Drawer/스크롤/잘림 문제

먼저 읽을 파일:

- `src/App.jsx`
- `src/hooks/useAppController.js`
- `src/lib/constants.js`
- `src/lib/format.js`

맡길 일:

- 화면 기능 구현
- 모바일에서 겹침/잘림/스크롤 문제 수정
- 사용자 친화 메시지 정리
- 관리자 목록/상세 표시 개선
- 기록 저장/복사/삭제 같은 사용자 액션 검토
- 상태값과 화면 전환이 맞는지 확인

금지할 일:

- 서버 API 계약을 임의로 바꾸기
- 디자인 톤을 큰 폭으로 바꾸기
- 카드 안 카드 구조 추가
- 사용자에게 내부 오류명 노출

산출물:

- 변경한 화면
- 주요 사용자 흐름
- 모바일/데스크톱 고려사항
- 남은 UX 리스크
- 필요한 서버 API 요청

## 3. Supabase/Data Agent

담당 범위:

- Supabase 테이블과 인덱스
- `docs/supabase-schema.sql`
- `conversations`
- `conversation_messages`
- `usage_events`
- `app_logs`
- `app_feedbacks`
- 데이터 무결성, 마이그레이션, RLS

먼저 읽을 파일:

- `docs/supabase-schema.sql`
- `server.js`의 Supabase 변환 함수
- 필요한 경우 Supabase MCP로 현재 테이블 구조 확인

맡길 일:

- 새 테이블/컬럼 설계
- 앱 모델과 DB 컬럼 매핑 검토
- 데이터 누락/잘림/불일치 원인 분석
- RLS와 서비스 키 접근 경계 확인
- 운영 DB에 적용한 변경을 스키마 문서에 반영

금지할 일:

- 운영 데이터 삭제/수정 자동 실행
- 사용자 대화 원문을 결과에 노출
- 보안 정책 없이 공개 테이블 추가
- 클라이언트에 service role 키 노출

산출물:

- 스키마 변경 요약
- 적용 SQL 또는 마이그레이션 이름
- 앱 모델 매핑 영향
- 무결성 리스크
- 수동 복구가 필요한 데이터 목록

## 4. QA/Regression Agent

담당 범위:

- 전체 사용자 흐름 검증
- 서버 문법과 빌드 검증
- 브라우저 로딩, 콘솔 오류, 주요 UI 상태
- 회귀 가능성이 큰 경로 탐색

먼저 읽을 파일:

- `package.json`
- `scripts/*`
- 변경된 파일 diff
- 필요하면 `docs/deployment-guide.md`

맡길 일:

- `node --check server.js`
- `npm.cmd run check`
- 필요한 경우 `npm.cmd run smoke`
- 로컬 브라우저로 핵심 화면 확인
- 오류 로그와 콘솔 에러 확인
- 변경 범위와 무관해 보여도 깨질 수 있는 인접 플로우 점검

금지할 일:

- 기능 구현을 대신 진행
- 실패한 테스트를 근거 없이 무시
- 운영 배포나 데이터 조작을 임의 실행

산출물:

- 통과/실패한 검증
- 재현 절차
- 발견한 회귀 위험
- 수정 권장 우선순위
- 테스트하지 못한 범위

## Orchestration Rules

작업 시작 시 메인 Codex는 먼저 변경 유형을 분류한다.

- API, 저장, 모델 호출이 있으면 Backend/API Agent를 사용한다.
- 화면, 메시지, 상태 전환, 모바일 UI가 있으면 Frontend/UX Agent를 사용한다.
- DB 스키마, Supabase, 데이터 복구, 로그/피드백 테이블이 있으면 Supabase/Data Agent를 사용한다.
- 코드 변경이 생기면 QA/Regression Agent를 마지막에 사용한다.

## bkit-Style Workflow

기본 흐름은 Plan → Design → Do → Check → Act → Report로 진행한다.

Plan:

- 사용자의 요청을 Context Anchor로 정리한다.
- 형식: WHY, WHO, SUCCESS, RISK, SCOPE, OUT OF SCOPE, FILES LIKELY TO CHANGE, QUALITY GATES.
- 애매한 요구사항은 먼저 코드와 데이터 흐름을 읽고 합리적 가정을 둔다.

Design:

- API, UI, DB가 함께 바뀌는 경우 서버-클라이언트-데이터 계약을 먼저 적는다.
- 복수 접근이 가능하면 2-3개 옵션을 비교하고 보수적인 선택을 한다.
- 큰 기능은 한 세션에서 끝낼 수 있는 크기로 나눈다.

Do:

- 필요한 하위 에이전트만 띄운다.
- 파일 소유권을 분리한다.
- 하위 에이전트는 자신이 맡은 파일과 책임만 수정한다.
- 메인 Codex는 즉시 통합이 필요한 블로킹 작업을 직접 맡는다.

Check:

- bkit의 gap-detector 방식을 차용해 다음 축으로 검증한다.
- Structural: 필요한 파일, 컴포넌트, 라우트가 있는가.
- Functional: 요구 기능이 실제로 동작하는가.
- Contract: server route, frontend call, data model이 일치하는가.
- Intent: 사용자의 실제 목적을 달성하는가.
- Behavioral: validation, auth, hidden/deleted, retry, duplicate submit, server error가 처리되는가.
- UX: loading, empty, success, error 상태가 사용자에게 명확한가.
- Runtime: `node --check server.js`, `npm.cmd run check`, 필요 시 smoke/browser/API 검증이 통과하는가.

Act:

- Overall Match가 90% 미만이라고 판단되면 반복 개선한다.
- 반복 개선은 최대 5회까지로 제한한다.
- 반복할 때는 점수 올리기용 주석이나 placeholder가 아니라 실제 동작을 고친다.

Report:

- 변경 파일, 검증 결과, 남은 위험, 배포/운영 확인 필요 사항을 짧게 남긴다.
- 민감한 원문 데이터는 보고하지 않는다.

병렬화 기준:

- Backend/API Agent와 Frontend/UX Agent는 API 계약이 명확하면 병렬로 진행할 수 있다.
- Supabase/Data Agent는 스키마 영향이 있으면 초기에 병렬로 조사한다.
- QA/Regression Agent는 구현 패치가 나온 뒤 실행한다.

통합 기준:

- 메인 Codex는 하위 에이전트 결과를 그대로 커밋하지 않고 diff를 검토한다.
- 서로 다른 에이전트가 같은 파일을 수정해야 하면 메인 Codex가 최종 편집을 맡는다.
- `codex/persona`에서 작업하고 검증 후 `master`에 병합한다.
- 빌드 산출물은 실제 `public/index.html`이 참조하는 새 번들만 포함한다.
- 내용 변경 없는 line ending 흔들림은 커밋하지 않는다.

하위 에이전트 프롬프트를 사용할 때:

- `spawn_agent`를 허용받은 작업에서만 실제 하위 에이전트를 띄운다.
- 각 에이전트에게 `docs/development-agents/{agent}.md` 내용을 요약해 전달한다.
- 코드 변경 에이전트에게는 파일 소유권을 반드시 명시한다.
- QA/Regression Agent는 구현 패치 이후에 실행한다.

기본 최종 검증:

```powershell
node --check server.js
npm.cmd run check
```

필요 시 추가 검증:

```powershell
npm.cmd run smoke
```
