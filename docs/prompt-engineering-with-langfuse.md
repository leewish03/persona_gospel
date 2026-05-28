# Langfuse로 프롬프트 엔지니어링하기 (Persona Gospel)

기록만 보는 게 아니라, **프롬프트 문장을 Langfuse에서 고치고 → 앱에 반영하고 → trace로 효과를 비교**하는 흐름입니다.

## 이 앱에서 프롬프트가 나뉘는 방식

| 구분 | 어디서 고치나 | Langfuse |
|------|----------------|----------|
| 시스템 프롬프트 (역할·금지 규칙) | `roleplay/persona-system` | **UI에서 수정 → 배포 없이 반영** (약 60초 캐시) |
| 피드백 코치 프롬프트 | `roleplay/feedback-system` | 동일 |
| 가드레일·세션 조립 문구 | `server.js` | 아직 코드 (나중에 옮길 수 있음) |
| 페르소나 6명 데이터·PAS | `data/personas.json` | trace 태그 `persona:kim-sihyun` 등으로 필터 |

**중요:** 김시현 말투·PAS 예시는 `personas.json`에 있습니다. Langfuse에서 고치는 건 주로 **공통 시스템 프롬프트**입니다. 페르소나별 문구 실험은 JSON 수정 + QA, 또는 Langfuse Dataset(다음 단계)입니다.

---

## 0. 한 번만: Langfuse에 프롬프트 올리기

로컬 또는 CI (키는 환경 변수만):

```bash
npm run langfuse:seed
```

생성되는 이름:

- `roleplay/persona-system`
- `roleplay/feedback-system`
- `persona/{id}/runtime-config` (메타·필터용)

---

## 1. 일상 루프 (프롬프트 엔지니어링)

```text
1. Langfuse → Prompts → roleplay/persona-system 열기
2. 새 버전 작성 (Playground로 샘플 대화 테스트)
3. 라벨:
   - 실험 중 → staging
   - 운영 반영 → production
4. Render 환경 변수:
   - 평소: LANGFUSE_PROMPT_LABEL=production
   - 실험: LANGFUSE_PROMPT_LABEL=staging  (재배포 후 1~2분)
5. 앱에서 대화 몇 턴
6. Langfuse → Traces:
   - generation에 Prompt 이름·버전이 붙어 있음
   - 태그 persona:*, user_move:* 로 필터
7. Prompt → Metrics 탭에서 버전별 latency·토큰 비교
8. 괜찮으면 staging 내용에 production 라벨 부여 (롤백은 UI에서 라벨만 되돌리면 됨)
```

**배포 없이** 시스템 프롬프트만 바꿀 수 있습니다. `personas.json`을 바꿀 때는 여전히 Git 배포가 필요합니다.

---

## 2. Render 환경 변수 (프롬프트용)

```text
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com

# 어떤 라벨의 프롬프트를 쓸지
LANGFUSE_PROMPT_LABEL=production

# Langfuse에서 가져온 뒤 캐시 유지 시간(ms). 기본 60000
LANGFUSE_PROMPT_REFRESH_MS=60000
```

관리자로 로그인한 뒤 확인:

- `GET /api/admin/langfuse-prompts` — 지금 file인지 langfuse인지, version
- `POST /api/admin/langfuse-prompts/refresh` — 캐시 즉시 비우기

---

## 3. 무엇을 Langfuse에서 고치면 효과가 큰가

이 프로젝트 QA 이슈 기준:

| 증상 | 먼저 볼 곳 |
|------|------------|
| 역할 뒤집힘·코칭 말투 | `persona-system` — “내부 절차”, 금지 예시 |
| PAS/라벨이 출력에 새음 | `persona-system` — 출력 금지 목록 |
| 같은 질문 반복 | `server.js` 동적 블록 + `personas.json` badResponsePatterns |
| 페르소나마다 반응이 비슷 | `personas.json` pasMap·example (페르소나별) |
| 피드백이 너무 길거나 신학만 함 | `feedback-system` |

Playground에서 **동적 input 일부를 붙여 넣고** 테스트하면 (실제 `chatDynamicPromptFor` 출력 복사) 현실에 가깝습니다.

---

## 4. staging → production 승격 (안전)

1. `production` 라벨은 **지금 서비스 중인 문장**만 유지
2. 개선안은 새 version + `staging` 라벨
3. Render에서 `LANGFUSE_PROMPT_LABEL=staging` 으로 10~20턴 QA
4. Langfuse Metrics / trace 품질 확인
5. UI에서 새 version에 `production` 라벨 이동 (구 version은 production 제거)
6. Render `LANGFUSE_PROMPT_LABEL=production` 복구

문제 생기면: 이전 version에 `production` 다시 붙이면 **코드 배포 없이 롤백**.

---

## 5. 다음 단계 (Dataset)

- `npm run langfuse:catalog` 로 6명 메타 생성
- QA 24케이스를 Langfuse Dataset으로 import
- LLM judge 또는 rule scorer로 **버전 A vs B** 자동 비교

이건 orchestrate worker 한 명에게 맡기기 좋습니다.

---

## 6. 관련 코드

- `lib/langfuse-prompts.js` — fetch + file fallback + 캐시
- `lib/langfuse-tracing.js` — trace + prompt 링크
- `scripts/langfuse-seed-prompts.mjs` — 초기 업로드
