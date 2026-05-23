# Langfuse 기반 프롬프트 엔지니어링 개선 계획

작성일: 2026-05-23  
관련 문서: `docs/persona-prompt-engineering-improvement-plan.md`, `docs/persona-prompt-engineering-implementation-spec.md`

## 1. 요약

이 저장소는 **복음 대화 훈련용 페르소나 롤플레이**를 위해 이미 상당한 프롬프트 엔지니어링(PAS, runtimeCard, 대화 상태 힌트, QA)을 구현했다.  
다음 단계의 병목은 “프롬프트 문장을 더 쓰는 것”보다 **변경·실험·회귀 검증을 제품/엔지니어링 루프로 고정하는 것**이다.

**Langfuse**는 프롬프트 버전 관리, 트레이스 관측, 데이터셋/실험, 실패 분석을 한곳에 모은다.  
**Orchestrate**(`/orchestrate`)는 그 통합 작업을 병렬 Cloud Agent로 나누어 실행한다.

현재 이 환경에는 `LANGFUSE_*`, `CURSOR_API_KEY`가 설정되어 있지 않다. 구현 전에 로컬/CI 시크릿에 아래를 추가해야 한다.

```bash
# Langfuse (UI → Settings → API Keys)
export LANGFUSE_PUBLIC_KEY=pk-lf-...
export LANGFUSE_SECRET_KEY=sk-lf-...
export LANGFUSE_HOST=https://cloud.langfuse.com   # US: https://us.cloud.langfuse.com

# Orchestrate kickoff (Cursor Dashboard → Integrations)
export CURSOR_API_KEY=...
```

---

## 2. 현재 상황 분석

### 2.1 이미 잘 갖춰진 부분

| 영역 | 현재 상태 |
|------|-----------|
| 시스템 프롬프트 | `prompts/persona-system-prompt.md`, `prompts/feedback-prompt.md` (파일 기반) |
| 페르소나 데이터 | `data/personas.json` — 6명 모두 `coreStack`, `pasMap`, `badResponsePatterns`, few-shot 등 |
| 런타임 조립 | `server.js` — `staticRoleplayPromptFor`, `chatDynamicPromptFor`, `conversationStateHints`, `formatPasExecutionPlan`, `roleplayPromptPartsFor` |
| 피드백 분리 | 역할 연기 vs 전도 훈련 피드백 프롬프트 분리 유지 |
| QA | `scripts/qa-interactive-roleplay.mjs` 등 — 정량 점수·플래그 (pas-leak, 반복 등) |
| 기획/스펙 | `persona-prompt-engineering-improvement-plan.md`, `implementation-spec.md` |

최근 interactive QA(2026-05-16)는 일부 케이스에서 100점 pass이나, **전체 24케이스·장기 회귀·프롬프트 변경 추적**은 아직 “파일 diff + 수동 QA 실행”에 의존한다.

### 2.2 구조적 한계 (Langfuse가 해결할 문제)

1. **프롬프트와 배포가 결합** — `prompts/*.md`나 `guardrailPrompt` 문자열 변경마다 `server.js` 재배포가 필요하다.
2. **실험 재현성 부족** — 어떤 프롬프트 버전 + 어떤 `pasMap` + 어떤 모델 설정이 특정 QA 실패를 만들었는지 UI에서 한 번에 보기 어렵다.
3. **동적 블록은 코드에만 존재** — `conversationStateHints`, `formatPasExecutionPlan` 출력은 Git에는 없고 런타임에만 생성된다. 실패 분석 시 “실제로 모델에 들어간 전체 입력”을 찾기 어렵다.
4. **평가 루프가 분산** — QA JSON/MD는 `docs/qa-runs/`에 쌓이지만 Langfuse 데이터셋·스코어·annotation queue와 연결되지 않는다.
5. **Langfuse 미통합** — `package.json`에 Langfuse SDK 없음, `.env.example`에 Langfuse 변수 없음.

### 2.3 프롬프트 인벤토리 (마이그레이션 대상)

Langfuse Prompt Management 기준으로 나눈다. **정적 텍스트**는 UI/SDK로 버전 관리하고, **동적 조립**은 코드에 두되 trace metadata로 연결한다.

| Langfuse 이름 (제안) | 유형 | 소스 | 변수 (`{{...}}`) |
|---------------------|------|------|------------------|
| `roleplay/persona-system` | text | `prompts/persona-system-prompt.md` | 없음 |
| `roleplay/feedback-system` | text | `prompts/feedback-prompt.md` | 없음 |
| `roleplay/guardrails` | text | `server.js` `guardrailPrompt` | 없음 |
| `roleplay/static-session-shell` | text | `staticRoleplayPromptFor` 고정 문단 | `personaName`, `relationship`, `setting`, `goal` 등 |
| `roleplay/chat-dynamic-shell` | text | `chatDynamicPromptFor` 고정 지침 블록 | `phase`, `settingHint`, `questionVariety` |
| `roleplay/initial-dynamic-shell` | text | `initialDynamicPromptFor` | `goalPressure` |
| `_sub/runtime-card-format` | text (subprompt) | `formatRuntimeCard` 출력 **템플릿** | `runtimeCardJson` (코드에서 JSON 직렬화) |
| `_sub/pas-execution-plan` | text | `formatPasExecutionPlan` **템플릿** | `selectedPas`, `userMove` |

**코드에 남길 것 (Langfuse `{{var}}`만으로 불가):**

- `conversationStateHints`, `conversationMemoryFor` — 휴리스틱/키워드 기반
- `formatPasExecutionPlan`의 trigger 매칭
- `data/personas.json` 전체 (페르소나별 데이터는 DB/JSON 유지, trace에 `personaId` 태그)

**Config로 Langfuse에 올릴 것 (prompt `config` JSON):**

```json
{
  "modelType": "chat",
  "reasoningEffort": "high",
  "maxOutputTokens": 3200
}
```

피드백 호출용 별도 config (`modelType: feedback`, `reasoningEffort: medium`).

---

## 3. Langfuse로 프롬프트 엔지니어링을 개선하는 방법

### 3.1 목표 워크플로

```mermaid
flowchart LR
  subgraph dev [개발 루프]
    A[Playground에서 프롬프트 수정] --> B[staging 라벨]
    B --> C[Dataset 실험]
    C --> D{회귀 통과?}
    D -->|yes| E[production 라벨 승격]
    D -->|no| A
  end
  subgraph prod [운영]
    E --> F[server.js getPrompt]
    F --> G[OpenAI 호출 + trace]
    G --> H[QA / annotation]
  end
```

### 3.2 단계별 구현

#### Phase 0 — 관측만 (가장 낮은 리스크)

**목표:** 배포 없이 “무엇이 모델에 들어갔는지”를 본다.

1. `@langfuse/client`, `@langfuse/otel`, `@langfuse/openai`(또는 수동 span) 추가
2. `callModelWithUsage` / `roleplayPromptPartsFor` 경로에 trace:
   - `sessionId`, `personaId`, `relationship`, `setting`, `goal`
   - `staticSystemBlocks`, `dynamicInput` (또는 해시+길이)
   - `instructions` 프롬프트 이름·버전 (`langfuse_prompt`)
3. `.env.example`에 `LANGFUSE_*` 문서화

**성공 기준:** Langfuse Traces에서 generation 클릭 시 입력 전문·토큰·모델 확인 가능.

#### Phase 1 — 정적 프롬프트 외부화

**목표:** `persona-system`, `feedback-system`, `guardrails`를 Langfuse `production`에서 fetch.

1. CLI/SDK로 초기 업로드 (`labels: ["production"]`)
2. `server.js` 시작 시 캐시된 `langfuse.prompt.get(..., { label: "production" })`
3. 로컬/CI fallback: 파일 읽기 (Langfuse 장애 시)

```javascript
// 패턴 (문서 기준 — 구현 시 최신 SDK 문서 재확인)
const personaPrompt = await getManagedPrompt("roleplay/persona-system", fallbackPath);
```

**성공 기준:** UI에서 시스템 프롬프트 문장 수정 → 재배포 없이(캐시 TTL 내) 반영.

#### Phase 2 — 동적 셸 + 링크

**목표:** 조립 구조는 코드, 문구는 Langfuse.

1. `chat-dynamic-shell` 등에 고정 지침 이전
2. Generation에 `prompt` 객체 연결 → 버전 diff로 “무엇이 바뀌어 실패했는지” 추적
3. Playground에서 `{{phase}}` 등 샘플 값으로 미리보기

#### Phase 3 — 평가·실험

**목표:** QA 스크립트 결과를 Langfuse Dataset/Experiment와 동기화.

1. **Dataset:** `qa-interactive-roleplay` 케이스 24개를 dataset item으로 import (입력: 세션 설정 + 사용자 시나리오, 기대: 체크리스트 ID)
2. **LLM-as-judge 또는 rule-based scorer:**
   - repetition, barrier_retention, pas_leak (기존 QA 로직 재사용)
3. **Experiments:** `staging` vs `production` 프롬프트 라벨 비교
4. **Annotation queue** (error-analysis 가이드): 실패 trace 50건 open coding → `pass_fail`, `failure_mode`

**성공 기준:** 프롬프트 PR마다 Experiment 리포트 링크를 PR 설명에 첨부.

#### Phase 4 — 운영 피드백 (선택)

- 세션 종료 후 thumbs → Langfuse score on trace
- `docs/persona-prompt-engineering-improvement-plan.md` 10절 원칙 유지: **사용자 피드백 UI에는 시뮬레이션 품질 노출 금지**, 내부 trace/score만

### 3.3 라벨 전략

| 라벨 | 용도 |
|------|------|
| `production` | Render/운영 서버 |
| `staging` | 실험·PR preview |
| `latest` | 자동 최신 (운영 fetch 금지) |

페르소나 데이터(`personas.json`)는 당분간 Git 버전 관리. trace metadata에 `personasGitSha`를 넣어 실험 재현.

### 3.4 기존 QA와의 관계

| 기존 | Langfuse 이후 |
|------|----------------|
| `npm run qa:*` 로컬 실행 | CI에서 동일 실행 + 결과를 experiment run으로 업로드 (선택) |
| `docs/qa-runs/*.md` | 사람 읽기용 요약 유지; canonical 메트릭은 Langfuse |
| 정량 rubric (반복 2회 이하 등) | Dataset run scorer로 자동화 |

---

## 4. Orchestrate로 실행하는 방법

Dispatcher는 **코딩하지 않고** root planner만 spawn한다. 아래 goal을 **그대로** kickoff에 넘긴다.

### 4.1 Kickoff (로컬 IDE에서 실행)

```bash
cd /path/to/cursor/plugins/.../skills/orchestrate/scripts
bun install   # 최초 1회

export CURSOR_API_KEY=...   # user key

bun cli.ts kickoff "Langfuse 통합으로 복음 대화 훈련소 프롬프트 엔지니어링 루프 구축: Phase 0 관측, Phase 1 정적 프롬프트 마이그레이션, QA-Langfuse 실험 연동. docs/langfuse-prompt-engineering-orchestration-plan.md 준수." \
  --ref master
```

출력 JSON의 `url`로 root planner 진행 상황을 본다.

### 4.2 권장 작업 분해 (planner가 publish할 task 예시)

| Task | 담당 | 산출물 |
|------|------|--------|
| T1 | Worker | `@langfuse/*` 의존성, `.env.example`, `getManagedPrompt` 헬퍼 |
| T2 | Worker | `callModelWithUsage` trace + metadata (`personaId`, prompt version) |
| T3 | Worker | Langfuse에 `roleplay/*` 프롬프트 초기 업로드 스크립트 |
| T4 | Worker | `persona-system` / `feedback-system` fetch + file fallback |
| T5 | Subplanner | Dataset import + experiment runner (`scripts/langfuse-qa-experiment.mjs`) |
| T6 | Verifier | `npm run check`, smoke, 2케이스 interactive QA, trace에 prompt 링크 확인 |

**충돌 방지:** T1–T4는 `server.js` + `package.json`; T5는 `scripts/`; planner가 handoff로 순서 고정.

### 4.3 Verifier 수락 기준

- [ ] Langfuse trace 1건 이상에 generation + linked prompt (Phase 1 이후)
- [ ] Langfuse 미설정 시 앱이 기존처럼 파일 fallback으로 기동
- [ ] `qa-interactive-roleplay` 2케이스 이상 pass, pas-leak 0
- [ ] 문서: README 또는 `docs/deployment-guide.md`에 `LANGFUSE_*` 설정 절 추가

---

## 5. 우선순위 (권장 순서)

1. **Phase 0** — 관측 (가치 대비 리스크 최소, 디버깅 즉시 개선)
2. **Phase 3 일부** — 기존 QA 점수를 Langfuse scorer로 복제 (프롬프트 UI 변경 전에 baseline)
3. **Phase 1** — 정적 3종 마이그레이션
4. **Phase 2** — 동적 셸
5. **Phase 4** — 사용자 score (필요 시)

프롬프트 **내용** 개선(PAS 예시 추가 등)은 Langfuse Playground + Dataset experiment가 붙은 **이후**에 iteration한다. 그렇지 않으면 “더 좋은 문장”인지 “측정 가능한 개선”인지 구분이 어렵다.

---

## 6. 리스크와 완화

| 리스크 | 완화 |
|--------|------|
| Langfuse 장애 | 파일 fallback + SDK 클라이언트 캐시 |
| 프롬프트 과대 — 토큰 증가 | `formatRuntimeCard` 제한 유지; trace에서 input 토큰 모니터링 |
| `{{var}}` 미지원 로직 | 조건/루프는 코드에서 전처리 (skill: prompt-migration) |
| 비밀키 노출 | 키는 채팅/PR에 붙이지 않음; Render env만 |
| Orchestrate와 server.js 충돌 | planner가 파일 소유권을 task별로 분리 |

---

## 7. 다음 액션 (사용자)

1. Langfuse 프로젝트 생성 → API 키 → `LANGFUSE_HOST` 지역 확인  
2. Render(또는 로컬)에 env 추가  
3. 로컬 IDE에서 `/orchestrate` kickoff (위 4.1) 또는 단일 agent로 Phase 0 PR  
4. Phase 0 merge 후 Playground에서 `persona-system` 1차 문구 실험 → `staging` → Experiment → `production` 승격

이 문서는 **계획**이다. 구현 PR은 Phase별로 나누는 것이 안전하다.
