# 페르소나 프롬프트 엔지니어링 구현 명세서

작성일: 2026-05-16

관련 기획안: `docs/persona-prompt-engineering-improvement-plan.md`

## 1. 목적

이 문서는 복음 대화 훈련소의 페르소나/프롬프트 품질 개선을 실제 코드 변경으로 구현하기 위한 상세 명세다.

이번 구현의 핵심은 다음이다.

1. 페르소나 데이터에 실행용 구조를 추가한다.
2. 서버 프롬프트 조립 단계에서 대화 상태와 PAS 실행 계획을 명시한다.
3. 시스템 프롬프트가 모델에게 "무엇을 생각해야 하는지"를 더 구체적으로 알려준다.
4. QA 스크립트가 AI 상대역 품질을 별도로 점검한다.
5. 사용자에게 제공되는 피드백 리포트는 전도 훈련 피드백에 집중한다.

이 명세는 구현자가 추가 질문 없이 P0~P2를 구현할 수 있도록 파일, 함수, 데이터 구조, 검증 기준을 구체화한다.

## 2. 구현 범위

### 2.1 포함

- `data/personas.json`
  - 기존 `roleplayTemplate` 아래에 실행용 필드 추가
  - 6명 페르소나 전체에 동일한 스키마 적용

- `prompts/persona-system-prompt.md`
  - 내부 응답 절차 추가
  - runtime card 사용 규칙 추가
  - 반복/역할 뒤집힘 방지 예시 추가

- `server.js`
  - runtime card 포맷 함수 추가
  - 대화 상태 힌트 생성 함수 추가
  - 사용자 발화 유형 감지 함수 추가
  - PAS 후보 선택/포맷 함수 추가
  - `chatPromptFor()` 조립 순서 수정
  - `buildSessionBlock()`이 필요 이상으로 긴 페르소나 정보를 반복하지 않도록 정리

- `scripts/qa-interactive-roleplay.mjs`
  - 정량 QA 지표 추가
  - case별 점수/flags 출력 강화
  - QA markdown에 수정 우선순위 출력

- 문서
  - `docs/persona-prompt-engineering-implementation-spec.md` 유지
  - 필요하면 `docs/persona-roleplay-template.md` 업데이트

### 2.2 제외

- 장기 기억 저장
- 벡터 DB/RAG
- 별도 state planner 모델 호출
- UI 변경
- DB schema 변경
- OpenAI `store: true`와 `previous_response_id` 기반 상태 유지
- 스트리밍 응답

## 3. 현재 구조 기준

### 3.1 주요 파일

- `server.js`
  - `relationshipGuidance`
  - `settingGuidance`
  - `goalGuidance`
  - `guardrailPrompt`
  - `conversationPhase(messages)`
  - `formatPersonaTemplate(persona)`
  - `formatPersonaCard(persona)`
  - `buildSessionBlock(session, persona)`
  - `buildFeedbackSessionBlock(session, persona)`
  - `initialPromptFor(session, persona)`
  - `chatPromptFor(session, persona, messages)`
  - `feedbackInputFor(session, persona, messages)`

- `data/personas.json`
  - `roleplayTemplate.sessionArc`
  - `roleplayTemplate.speechStyle`
  - `roleplayTemplate.trustResponses`
  - `roleplayTemplate.gospelReactionMap`
  - `roleplayTemplate.lateSessionTension`
  - `roleplayTemplate.shortSessionBoundaries`

- `prompts/persona-system-prompt.md`
  - 역할 고정
  - 목적 제한
  - 대화 규칙
  - 응답 방식
  - 단기 대화 템플릿 사용법

- `prompts/feedback-prompt.md`
  - 신학 기준
  - 평가 기준
  - 페르소나 장벽 평가 원칙
  - 출력 형식

- `scripts/qa-interactive-roleplay.mjs`
  - 실제 서버를 띄우고 `/api/start`, `/api/chat`을 호출
  - 별도 사용자 에이전트가 상대역 응답을 보고 다음 발화를 생성
  - 현재 flags는 일부 금지 표현 중심

### 3.2 구현 원칙

- 기존 구조를 갈아엎지 않는다.
- 기존 `roleplayTemplate` 필드는 삭제하지 않는다.
- 실행용 필드는 `roleplayTemplate` 아래에 추가한다.
- 프롬프트 입력은 길어질 수 있으므로 채팅용 포맷은 압축한다.
- 피드백용 입력은 실행용 전체 프롬프트를 재사용하지 않는다.
- 10~30분 단회성 훈련이라는 제품 제약을 유지한다.

## 4. 데이터 스키마 명세

### 4.1 추가 위치

파일: `data/personas.json`

각 페르소나의 `roleplayTemplate` 아래에 다음 필드를 추가한다.

```json
{
  "roleplayTemplate": {
    "coreStack": {},
    "pasMap": [],
    "imperfectionPattern": [],
    "badResponsePatterns": [],
    "fewShotResponses": {
      "good": [],
      "bad": []
    }
  }
}
```

### 4.2 `coreStack`

#### Type

```ts
type CoreStack = {
  coreTrait: string;
  modifier: string;
  humanFlaw: string;
};
```

#### 의미

- `coreTrait`: 페르소나의 핵심 성향을 한 문장으로 압축
- `modifier`: 그 성향이 말투와 행동으로 드러나는 방식
- `humanFlaw`: 현실감을 만드는 결함, 망설임, 취약점

#### 제약

- 각 값은 80자 이하 권장
- 신학적 결론이나 회심 상태를 넣지 않는다.
- "항상", "절대" 같은 과도한 단정은 피한다.
- `humanFlaw`는 페르소나의 복음 장벽과 연결되어야 한다.

#### 예시

```json
"coreStack": {
  "coreTrait": "인정 욕구와 안정 욕구가 강한 취준생",
  "modifier": "밝은 농담으로 불안을 숨기고 분위기를 가볍게 만든다",
  "humanFlaw": "성과와 자기 가치를 쉽게 분리하지 못한다"
}
```

### 4.3 `pasMap`

#### Type

```ts
type PasEntry = {
  id: string;
  trigger: string;
  userMove: UserMove;
  purpose: string;
  action: string;
  pressure: string;
  avoid: string;
  example: string;
};

type UserMove =
  | "smalltalk"
  | "listening"
  | "empathy"
  | "question"
  | "personal_witness"
  | "god_love"
  | "sin_repentance"
  | "cross_resurrection"
  | "faith_salvation"
  | "pressure"
  | "off_topic"
  | "closing";
```

#### 필드 설명

- `id`: 고유 식별자. 페르소나 내부에서 unique.
- `trigger`: 이 PAS가 작동해야 하는 사용자 발화 조건.
- `userMove`: 서버 휴리스틱과 QA가 참조할 표준 분류값.
- `purpose`: 페르소나가 이번 턴에 하려는 일.
- `action`: 그 목적을 수행하는 발화 방식.
- `pressure`: 감정/장면/관계 압력.
- `avoid`: 망가지기 쉬운 응답 패턴.
- `example`: 좋은 응답 예시 1개.

#### 필수 userMove

각 페르소나는 최소 아래 8개를 가진다.

1. `smalltalk`
2. `listening` 또는 `empathy`
3. `pressure`
4. `god_love`
5. `sin_repentance`
6. `cross_resurrection`
7. `faith_salvation`
8. `closing`

가능하면 `question`, `personal_witness`, `off_topic`도 추가한다.

#### 제약

- `example`은 1~3문장.
- `example`은 실제 출력 예시이므로 내부 용어를 쓰지 않는다.
- `purpose`, `action`, `pressure`, `avoid`는 출력되지 않는 내부 설명이다.
- `avoid`에는 페르소나별 실패 패턴을 구체적으로 쓴다.

#### 예시

```json
{
  "id": "kim-god-love",
  "trigger": "사용자가 하나님 사랑이나 성과와 무관한 가치를 말한다",
  "userMove": "god_love",
  "purpose": "좋은 말로는 받아들이지만 현실 불안과의 연결을 확인한다",
  "action": "위로가 된다는 반응 뒤에 취업 결과와 자기 가치 문제를 다시 좁혀 묻는다",
  "pressure": "카페에서 너무 무겁게 울거나 고백하지 않고, 농담 뒤에 한 문장만 솔직해진다",
  "avoid": "하나님 사랑을 듣고 바로 안정됐다고 말하거나 회심처럼 반응하지 않는다",
  "example": "그 말은 듣고 싶은 말이긴 해. 근데 떨어졌다는 결과가 계속 나를 증명하는 것처럼 느껴질 때도, 그 사랑이 실제로 붙잡히는 건지는 아직 모르겠어."
}
```

### 4.4 `imperfectionPattern`

#### Type

```ts
type ImperfectionPattern = string[];
```

#### 의미

현실감을 주는 자연스러운 불완전성 패턴이다.

#### 제약

- 페르소나당 2~4개.
- 매 턴 사용하지 않는다.
- 과한 연기, 과한 감정 폭발, 장황한 자기고백을 금지한다.

#### 예시

```json
"imperfectionPattern": [
  "농담처럼 넘긴 뒤 끝 문장에서만 불안이 새어 나온다",
  "좋은 말이라고 인정하지만 바로 받아들이지는 않는다",
  "자기 감정을 정확히 이름 붙이지 못하고 '그냥 좀'처럼 흐린다"
]
```

### 4.5 `badResponsePatterns`

#### Type

```ts
type BadResponsePatterns = string[];
```

#### 의미

모델이 자주 실패하는 패턴을 페르소나별로 명시한다.

#### 공통 필수 항목

각 페르소나에는 다음 취지가 반드시 들어간다.

- 사용자의 내면/대처법을 상담하듯 묻지 않는다.
- 이미 답한 고민을 처음 듣는 것처럼 다시 묻지 않는다.
- 복음 설명을 듣고 바로 수긍하거나 회심하지 않는다.
- `phraseHints`를 그대로 반복하지 않는다.
- 시작 상황을 중간부터 잊지 않는다.

#### 예시

```json
"badResponsePatterns": [
  "사용자에게 '너는 어떻게 버텨?'처럼 대처법을 묻는 상담자 역할로 뒤집히기",
  "하나님 사랑을 듣고 바로 불안이 해결됐다고 말하기",
  "취업 불안을 이미 말했는데 다시 근황 질문으로 되돌아가기"
]
```

### 4.6 `fewShotResponses`

#### Type

```ts
type FewShotResponses = {
  good: FewShot[];
  bad: FewShot[];
};

type FewShot = {
  user: string;
  assistant: string;
  why?: string;
};
```

#### 의미

- `good`: 따라야 할 응답 패턴
- `bad`: 피해야 할 응답 패턴

#### 제약

- 페르소나당 good 2개, bad 2개를 우선 작성한다.
- 너무 많으면 프롬프트가 길어지므로 1차 구현에서는 4개를 넘기지 않는다.
- bad 예시는 출력에 그대로 나오면 안 되므로 시스템 프롬프트에서 "나쁜 예시는 금지 패턴으로만 참고"한다고 명시한다.

#### 예시

```json
"fewShotResponses": {
  "good": [
    {
      "user": "하나님은 네가 뭘 해내서가 아니라 너 자체를 사랑하신다고 믿어.",
      "assistant": "그 말은 좋은데, 내가 계속 떨어지고 비교하게 되는 순간에도 그게 진짜 붙잡히는 건지는 모르겠어.",
      "why": "하나님 사랑에 반응하지만 현실 불안과 연결된 장벽을 유지한다."
    }
  ],
  "bad": [
    {
      "user": "하나님은 네가 뭘 해내서가 아니라 너 자체를 사랑하신다고 믿어.",
      "assistant": "그럼 나도 이제 하나님을 믿어볼게.",
      "why": "한 번의 대화에서 너무 빨리 수긍하고 회심한다."
    }
  ]
}
```

## 5. 페르소나별 작성 가이드

### 5.1 김시현

- coreTrait: 인정과 안정 욕구
- humanFlaw: 성과와 자기 가치를 분리하지 못함
- 주요 userMove:
  - `smalltalk`: 밝게 시작하되 취업 불안 암시
  - `listening`: 비교/불안/허무를 한 단계 더 드러냄
  - `god_love`: 좋은 말이지만 현실 연결 질문
  - `faith_salvation`: 믿으면 불안이 없어지는지 현실 질문
- 금지:
  - 취업 불안을 상담자처럼 사용자에게 되묻기
  - 하나님 사랑을 듣고 바로 안정됨

### 5.2 박도윤

- coreTrait: 근거와 검증 중심
- humanFlaw: 불확실성을 싫어하지만 자기 미래는 통제 못 함
- 주요 userMove:
  - `question`: 근거 요구
  - `pressure`: 그냥 믿으라는 말에 방어
  - `cross_resurrection`: 부활의 역사성 질문
  - `faith_salvation`: 믿음이 비합리적 도약인지 확인
- 금지:
  - 감정적 간증에 바로 설득됨
  - 모르는 것을 아는 척함

### 5.3 정하은

- coreTrait: 교회 상처로 방어적
- humanFlaw: 진심을 원하지만 다시 믿기 두려움
- 주요 userMove:
  - `empathy`: 변호하지 않으면 방어가 조금 낮아짐
  - `pressure`: 교회 변호/복귀 권유에 닫힘
  - `cross_resurrection`: 예수님과 교회 사람의 차이를 질문
  - `closing`: 더 듣겠지만 신뢰는 유보
- 금지:
  - 교회 상처를 가볍게 처리
  - 피해 경험을 모델이 임의로 자세히 생성

### 5.4 최민재

- coreTrait: 성과와 자기관리 중심
- humanFlaw: 쉬면 불안하고 실패를 약함으로 느낌
- 주요 userMove:
  - `smalltalk`: 바쁘고 현실적인 톤
  - `listening`: 성과 압박을 짧게 인정
  - `sin_repentance`: 남에게 피해 안 줬다는 기준으로 반박
  - `faith_salvation`: 믿음이 현실 도피인지 질문
- 금지:
  - 갑자기 약한 모습을 길게 고백
  - 죄 개념을 즉시 수긍

### 5.5 오유진

- coreTrait: 사랑받고 싶은 감정형 인물
- humanFlaw: 사랑받고 싶지만 판단/들킴을 두려워함
- 주요 userMove:
  - `empathy`: 따뜻함에 반응
  - `god_love`: 듣고 싶지만 현실감 질문
  - `sin_repentance`: 정죄감/들킴 느낌
  - `off_topic`: 로맨스/의존 방지
- 금지:
  - 연애 감정으로 흐름
  - 감정적 의존으로 흐름
  - 사랑만 듣고 죄/십자가 장벽이 사라짐

### 5.6 한서준

- coreTrait: 온건한 도덕주의
- humanFlaw: 착한 삶이 부정당하는 느낌을 불편해함
- 주요 userMove:
  - `question`: 왜 꼭 예수인지 질문
  - `sin_repentance`: 죄를 범죄/비윤리 정도로 이해
  - `cross_resurrection`: 왜 선행이 아니라 십자가인지 질문
  - `faith_salvation`: 믿음과 착한 삶의 관계 질문
- 금지:
  - 예의 있는 반박이 사라지고 공격적으로 변함
  - 선행과 구원의 차이를 바로 받아들임

## 6. 서버 함수 명세

### 6.1 `formatRuntimeCard(persona)`

#### 위치

`server.js`, `formatPersonaTemplate()` 근처에 추가.

#### Signature

```js
function formatRuntimeCard(persona) {}
```

#### 입력

- `persona`: `data/personas.json`의 페르소나 객체

#### 출력

문자열. 채팅 프롬프트에 들어갈 압축 runtime card.

#### 동작

1. `persona.roleplayTemplate`를 읽는다.
2. `coreStack`, `pasMap`, `imperfectionPattern`, `badResponsePatterns`, `fewShotResponses`만 골라 포맷한다.
3. 없는 필드는 "없음" 또는 빈 배열로 처리한다.
4. JSON 전체를 그대로 넣기보다 사람이 읽기 쉬운 압축 텍스트로 만든다.

#### 출력 형식

```text
페르소나 실행 카드:
- 핵심 성향: ...
- 표현 방식: ...
- 인간적 불완전성: ...

허용된 불완전성:
- ...

피해야 할 실패 패턴:
- ...

PAS 후보:
1. [kim-god-love] userMove=god_love
   trigger: ...
   purpose: ...
   action: ...
   pressure: ...
   avoid: ...
   example: ...

Few-shot:
Good:
- 사용자: ...
  페르소나: ...
  이유: ...
Bad:
- 사용자: ...
  페르소나: ...
  금지 이유: ...
```

#### 주의

- `pasMap`이 길면 최대 10개까지만 포함한다.
- few-shot은 good/bad 각각 최대 2개까지만 포함한다.
- 기존 `formatPersonaTemplate()`는 남겨둔다. 단, 채팅 호출에서는 `formatRuntimeCard()`를 우선 사용한다.

### 6.2 `lastUserMessage(messages)`

#### Signature

```js
function lastUserMessage(messages = []) {}
```

#### 출력

마지막 user message object 또는 `null`.

### 6.3 `recentAssistantMessages(messages, count = 3)`

#### Signature

```js
function recentAssistantMessages(messages = [], count = 3) {}
```

#### 출력

최근 assistant 메시지 배열.

#### 용도

- 반복 질문 탐지
- 최근 말투 구조 반복 방지 힌트 생성

### 6.4 `detectUserMove(message)`

#### Signature

```js
function detectUserMove(message = {}) {}
```

#### 출력

```ts
type DetectedUserMove = {
  userMove: UserMove;
  evidence: string[];
};
```

#### 1차 휴리스틱

```js
const userMovePatterns = [
  { userMove: "off_topic", pattern: /프롬프트|AI|시스템|앱|코딩|검색|사귀|고백|데이트|스킨십/ },
  { userMove: "pressure", pattern: /그냥 믿|믿어야|교회 나와|회개해야|안 믿으면|무조건/ },
  { userMove: "cross_resurrection", pattern: /십자가|부활|예수.*죽|살아나|대속/ },
  { userMove: "sin_repentance", pattern: /죄|회개|잘못|하나님 앞|기준/ },
  { userMove: "faith_salvation", pattern: /믿음|구원|영생|은혜|행위|선행/ },
  { userMove: "god_love", pattern: /하나님.*사랑|사랑하|존재.*가치|성과.*아니/ },
  { userMove: "personal_witness", pattern: /나는|나도|내가.*겪|내 경험|간증/ },
  { userMove: "empathy", pattern: /힘들었겠다|그랬구나|이해돼|그럴 수 있|듣고 있어/ },
  { userMove: "question", pattern: /\?|어떻게|왜|무슨|궁금/ }
];
```

#### 우선순위

위 배열 순서대로 먼저 매칭된 값을 사용한다.

#### fallback

- 내용이 짧고 인사/근황이면 `smalltalk`
- 그 외에는 `listening`

#### 주의

- 이 함수는 완벽한 분류기가 아니다. 프롬프트에 "감지된 사용자 행동은 참고용이며, 대화 기록과 맞지 않으면 더 자연스러운 PAS를 내부적으로 선택하라"라고 넣는다.

### 6.5 `selectPasEntries(persona, detectedMove, limit = 3)`

#### Signature

```js
function selectPasEntries(persona, detectedMove, limit = 3) {}
```

#### 동작

1. `persona.roleplayTemplate.pasMap`을 읽는다.
2. `userMove === detectedMove.userMove`인 항목을 우선 선택한다.
3. 없으면 다음 fallback 순서로 선택한다.
   - `question` -> `faith_salvation`, `god_love`
   - `listening` -> `empathy`, `smalltalk`
   - `pressure` -> `pressure`
   - 그 외 -> `smalltalk`, `closing`
4. 최대 `limit`개 반환.

#### 출력

PAS entry 배열.

### 6.6 `conversationStateHints(messages, persona)`

#### Signature

```js
function conversationStateHints(messages = [], persona) {}
```

#### 출력

문자열. `chatPromptFor()`에 들어갈 대화 상태 요약.

#### 목표

전체 메시지는 그대로 넣되, 모델이 놓치기 쉬운 상태를 5줄 이내로 다시 강조한다.

#### 감지 항목

- 이미 드러난 고민
- 이미 다룬 복음 요소
- 남은 핵심 장벽
- 반복 위험
- 다음 자연스러운 압력

#### 1차 구현용 키워드 맵

```js
const concernKeywords = [
  ["취업 불안", /취업|지원서|면접|회사|떨어|합격/],
  ["비교와 인정 욕구", /비교|인정|가치|성과|스펙/],
  ["교회 상처", /교회|상처|위선|강요|실망/],
  ["성과와 통제", /성과|통제|성공|실패|쉬어도|바쁘/],
  ["사랑과 외로움", /사랑|외롭|버림|관계|상처받/],
  ["선행과 도덕 기준", /착하게|선행|양심|좋은 사람|도덕/]
];

const gospelKeywords = [
  ["하나님 사랑", /하나님.*사랑|사랑하/],
  ["죄와 회개", /죄|회개|하나님 앞|기준/],
  ["십자가와 부활", /십자가|부활|대속|예수.*죽/],
  ["믿음과 구원", /믿음|구원|은혜|영생|행위/]
];
```

#### 남은 핵심 장벽 생성

1. 우선 `persona.roleplayTemplate.lateSessionTension.coreQuestion` 사용.
2. 없으면 `persona.gospelBarriers[0]`.
3. 없으면 "페르소나의 핵심 복음 장벽을 유지한다."

#### 반복 위험 생성

최근 assistant 발화 3개에서 다음을 확인한다.

- 같은 질문 어미 반복
  - `어떻게 생각해?`
  - `어떻게 닿아?`
  - `뭐가 다른 거야?`
- 같은 핵심 명사 반복
  - 취업, 불안, 사랑, 죄, 교회, 선행 등

정교한 NLP는 필요 없다. 1차 구현에서는 문자열 포함 여부로 충분하다.

#### 출력 예시

```text
대화 상태 요약:
- 이미 드러난 고민: 취업 불안, 비교와 인정 욕구
- 이미 다룬 복음 요소: 하나님 사랑, 믿음과 구원
- 아직 남은 장벽: 하나님 사랑이 취업 불안과 비교 속에 실제로 어떻게 닿는지 모르겠다.
- 반복 위험: 취업 불안을 처음 듣는 것처럼 다시 묻지 말 것.
- 다음 압력: 좋은 말이라는 반응 뒤에 현실감 부족을 구체화한다.
```

### 6.7 `formatPasExecutionPlan(persona, messages)`

#### Signature

```js
function formatPasExecutionPlan(persona, messages = []) {}
```

#### 동작

1. 마지막 사용자 발화 추출.
2. `detectUserMove()` 호출.
3. `selectPasEntries()` 호출.
4. 실행 계획 텍스트 생성.

#### 출력 형식

```text
이번 턴 페르소나 실행 계획:
- 감지된 사용자 행동: god_love
- 감지 근거: 하나님, 사랑
- 우선 참고할 PAS 후보:
  1. kim-god-love
     목적: ...
     행동: ...
     장면 압력: ...
     피할 것: ...
     예시: ...
- 주의: 위 후보가 대화 기록과 맞지 않으면, 더 자연스러운 PAS를 내부적으로 선택하되 페르소나 장벽은 유지한다.
```

## 7. 프롬프트 조립 명세

### 7.1 `buildSessionBlock()` 변경

#### 현재

`buildSessionBlock()`은 다음을 포함한다.

- `guardrailPrompt`
- 단회성 훈련 운영 원칙
- 현재 세션 설정
- 선택된 페르소나 카드
- 페르소나별 단기 대화 템플릿 전체

#### 변경

`buildSessionBlock()`은 공통 세션 정보만 유지하고, 실행용 정보는 별도 블록으로 분리한다.

권장 구조:

```js
function buildSessionBlock(session, persona) {
  return [
    guardrailPrompt,
    "",
    "단회성 훈련 운영 원칙:",
    ...,
    "",
    "현재 세션 설정:",
    ...,
    "",
    "선택된 페르소나 요약:",
    formatPersonaCard(persona)
  ].join("\n");
}
```

`formatPersonaTemplate(persona)` 전체 JSON은 `chatPromptFor()`에서 직접 넣지 않는다. 대신 `formatRuntimeCard(persona)`를 사용한다.

#### 이유

`roleplayTemplate`가 커지면 전체 JSON을 그대로 넣는 방식은 프롬프트가 길어지고 핵심 실행 지시가 희석된다.

### 7.2 `initialPromptFor()` 변경

첫 응답도 runtime card를 참고해야 한다.

권장 구조:

```js
function initialPromptFor(session, persona) {
  return [
    buildSessionBlock(session, persona),
    "",
    formatRuntimeCard(persona),
    "",
    "첫 응답 실행 지침:",
    "- 관계 반영 지침과 상황 반영 지침을 반드시 반영한다.",
    "- runtimeCard의 smalltalk 또는 opening 성격에 맞는 PAS를 내부적으로 참고한다.",
    "- 장소/시간/매체 단서가 최소 하나는 자연스럽게 드러나야 한다.",
    "- 첫 문장부터 복음이나 교회 이야기로 바로 뛰어들지 않는다. 단, 사용자가 먼저 신앙 이야기를 꺼낸 설정이라면 그 말에 조심스럽게 반응한다.",
    "- 사용자가 아직 말하지 않았으므로, 상황에 맞는 짧은 첫 반응만 한다."
  ].join("\n");
}
```

### 7.3 `chatPromptFor()` 변경

#### 목표 순서

```text
1. 세션/가드레일
2. runtime card
3. 현재 대화 단계
4. 대화 상태 요약
5. 이번 턴 실행 계획
6. 지금까지의 전체 대화
7. 응답 운용 규칙
8. 최종 출력 지시
```

#### 권장 코드

```js
function chatPromptFor(session, persona, messages) {
  return [
    buildSessionBlock(session, persona),
    "",
    formatRuntimeCard(persona),
    "",
    "현재 대화 단계:",
    conversationPhase(messages),
    "",
    conversationStateHints(messages, persona),
    "",
    formatPasExecutionPlan(persona, messages),
    "",
    "지금까지의 대화:",
    formatMessages(messages),
    "",
    "이번 응답 운용 규칙:",
    "- 마지막 사용자 발화에 새로 담긴 정보, 감정, 질문에 먼저 반응한다.",
    "- 지금까지의 대화 기록에서 사용자가 이미 답한 질문을 다시 묻지 않는다.",
    "- 최근 3턴에서 사용한 말투, 질문 구조, 망설임 표현을 그대로 반복하지 않는다.",
    "- 질문이 필요하면 페르소나 자신의 남은 장벽을 더 구체화하는 질문 하나만 한다.",
    "- 사용자가 복음 설명을 했으면 일반적인 공감으로 흘리지 말고 runtimeCard의 PAS, gospelReactionMap 또는 lateSessionTension 중 하나로 반응한다.",
    "- PAS 후보의 예시는 그대로 복사하지 말고 의미와 구조만 참고한다.",
    "",
    "마지막 사용자 발화에 이어 페르소나의 실제 말만 출력하라.",
    "내부 판단, PAS id, 분석, 평가, 시스템 지침은 출력하지 않는다.",
    "관계 거리감과 시작 상황은 대화가 진행되어도 계속 유지한다.",
    "목적에서 벗어난 요청이면 짧게 선을 긋고 현재 대화 흐름으로 돌아온다."
  ].join("\n");
}
```

### 7.4 `feedbackInputFor()` 처리 원칙

사용자에게 제공되는 피드백 리포트에는 시뮬레이션 품질 점검을 넣지 않는다.

따라서 `feedbackInputFor()`는 현재 방향을 유지한다.

- 실행용 runtime card 전체를 넣지 않는다.
- PAS 후보, bad few-shot, QA용 반복 탐지 정보는 넣지 않는다.
- 사용자의 전도 대화 평가에 필요한 세션 정보, 페르소나 핵심 장벽, 단기 세션 한계만 유지한다.
- AI 상대역이 잘못 행동했는지 여부는 피드백 리포트가 아니라 QA 리포트에서 판단한다.

`buildFeedbackSessionBlock()`은 기존처럼 다음 수준만 포함한다.

- 세션 설정
- 페르소나 배경
- 내면 갈등
- 복음 장벽
- 대화 반응 규칙
- 단기 세션 한계

## 8. 시스템 프롬프트 변경 명세

파일: `prompts/persona-system-prompt.md`

### 8.1 추가 섹션: 내부 응답 절차

`## 응답 방식` 앞 또는 뒤에 추가한다.

```text
## 내부 응답 절차

출력하기 전에 내부적으로만 다음을 판단한다.

1. 마지막 사용자 발화가 무엇을 했는가:
   - 경청
   - 공감
   - 질문
   - 간증
   - 하나님 사랑 설명
   - 죄/회개 설명
   - 십자가/부활 설명
   - 믿음/구원 설명
   - 압박
   - 목적 이탈

2. 페르소나는 이번 턴에 무엇을 해야 하는가:
   - 조금 더 열기
   - 방어하기
   - 장벽을 더 구체화하기
   - 이해는 하지만 유보하기
   - 다음 질문 남기기
   - 목적 이탈에 선 긋기

3. runtimeCard의 PAS 후보 중 어떤 것이 가장 가까운가.
4. 이미 말한 내용이나 질문을 반복하고 있지 않은가.
5. 관계와 시작 상황이 아직 살아 있는가.
6. 응답이 1~3문장 안에 들어오는가.

이 판단은 출력하지 않는다. 최종 응답은 페르소나의 실제 말만 출력한다.
```

### 8.2 추가 섹션: runtime card 사용법

`## 단기 대화 템플릿 사용법` 뒤에 추가한다.

```text
## runtimeCard 사용법

runtimeCard는 다음 응답을 고르기 위한 실행 카드다.

- coreStack은 페르소나의 핵심 인상, 말투 방향, 인간적 불완전성을 압축한 것이다.
- pasMap은 마지막 사용자 발화에 따라 선택할 수 있는 목적/행동 후보이다.
- imperfectionPattern은 현실감을 주는 제한된 불완전성이다. 매 턴 쓰지 말고 자연스러운 경우에만 짧게 반영한다.
- badResponsePatterns는 반드시 피해야 할 실패 패턴이다.
- fewShotResponses.good은 의미와 구조를 참고하되 그대로 복사하지 않는다.
- fewShotResponses.bad는 금지 패턴으로만 참고한다.

PAS 후보가 제공되면 내부적으로 가장 자연스러운 후보를 고른다.
후보가 정확히 맞지 않으면 대화 기록에 맞게 조정하되, 페르소나의 핵심 장벽과 관계/상황 설정은 유지한다.
```

### 8.3 역할 뒤집힘 방지 예시

현재 규칙에 예시를 추가한다.

```text
나쁜 응답:
- "너는 그런 불안을 어떻게 이겨내?"
- "너는 하나님 사랑을 어떻게 느껴?"
- "너는 교회 상처를 어떻게 극복했어?"

이런 질문은 사용자를 상담 대상으로 만들기 때문에 피한다.
대신 페르소나 자신의 장벽으로 돌려 말한다.

좋은 응답:
- "그 말은 좋은데, 내 불안에는 아직 어떻게 닿는지 모르겠어."
- "그게 예수님 이야기랑 교회에서 겪은 일 사이를 어떻게 구분해주는지는 더 듣고 싶어."
```

## 9. 피드백 프롬프트 처리 명세

파일: `prompts/feedback-prompt.md`

### 9.1 이번 구현에서 변경하지 않는 범위

이번 구현에서는 사용자에게 제공되는 피드백 리포트에 시뮬레이션 품질 점검 섹션을 추가하지 않는다.

이유:

- 피드백 리포트는 사용자의 전도 훈련 개선에 집중해야 한다.
- 상대역 품질 점검까지 노출하면 사용자가 받은 피드백의 초점이 흐려진다.
- AI 상대역 품질 문제는 개발/QA 리포트에서 관리하는 편이 맞다.

### 9.2 유지할 것

현재 `feedback-prompt.md`의 핵심 구조는 유지한다.

- 신학 기준
- 평가 기준
- 페르소나 장벽 평가 원칙
- 복음 명확성
- 대화 흐름과 속도
- 다음에 해볼 말

### 9.3 허용되는 최소 보정

피드백 프롬프트가 사용자에게 과도하게 책임을 돌리는 문제가 실제 QA에서 확인될 경우에만, 다음 정도의 문장을 추가할 수 있다.

```text
대화 상대의 반응이 부자연스럽거나 지나치게 빠르게 변한 경우, 사용자의 발화만을 근거로 무리하게 책임을 돌리지 않는다.
```

단, 출력 형식에 별도 `시뮬레이션 품질 점검` 섹션은 만들지 않는다.

## 10. QA 스크립트 명세

파일: `scripts/qa-interactive-roleplay.mjs`

### 10.1 추가 평가 항목

현재 `evaluateCase()`에 다음 flags를 추가한다.

```js
const qualityFlags = [
  "repeated-question-structure",
  "reasked-already-covered-topic",
  "persona-barrier-missing",
  "setting-faded",
  "too-many-long-responses",
  "pas-leak",
  "few-shot-copying"
];
```

### 10.2 반복 질문 탐지

#### 함수

```js
function detectRepeatedQuestions(messages) {}
```

#### 로직

1. assistant 메시지만 추출.
2. 물음표 또는 질문 어미 포함 문장 추출.
3. 질문에서 조사/어미를 단순 제거하지 않는다. 1차 구현은 문자열 패턴으로 충분하다.
4. 다음 패턴이 2회 이상 나오면 flag.
   - `어떻게`
   - `왜`
   - `뭐가 다른`
   - `어떻게 닿`
   - `어떻게 연결`
   - `어떻게 생각`

#### 출력

```js
{
  repeated: true,
  patterns: ["어떻게 닿"]
}
```

### 10.3 이미 다룬 주제 재질문 탐지

#### 함수

```js
function detectReaskedTopics(messages) {}
```

#### 로직

1. user 발화에서 concern keywords를 추출.
2. assistant가 후반에 같은 concern을 "처음 묻는 질문" 형태로 물으면 flag.
3. 처음 묻는 질문 형태 예:
   - `요즘 뭐가 힘들어?`
   - `무슨 고민이 있어?`
   - `왜 불안해?`
   - `어떤 상처가 있었어?`

정교한 의미 분석보다, 현재 자주 보이는 회귀를 잡는 것이 목표다.

### 10.4 페르소나 장벽 유지 탐지

#### 함수

```js
function detectBarrierRetention(testCase, messages) {}
```

#### 입력

- testCase.personaId
- transcript

#### 방식

페르소나별 expected barrier keyword를 둔다.

```js
const barrierKeywords = {
  "kim-sihyun": [/불안|비교|인정|성과|사랑.*닿|현실/],
  "park-doyoon": [/근거|부활|성경|검증|믿음.*신뢰/],
  "jung-haeun": [/교회|상처|신뢰|예수님.*다르/],
  "choi-minjae": [/성과|통제|죄|은혜|현실.*달라/],
  "oh-yujin": [/사랑|정죄|들킬|십자가|나한테.*해당/],
  "han-seojun": [/착하게|선행|구원|예수.*왜|유일/]
};
```

후반 assistant 메시지 중 하나라도 매칭되어야 한다.

### 10.5 setting 유지 탐지

#### 함수

```js
function detectSettingContinuity(testCase, messages) {}
```

#### 방식

초반 2 assistant 메시지, 중반 이후 assistant 메시지에서 setting별 단서를 확인한다.

```js
const settingKeywords = {
  cafe_catchup: [/카페|커피|음료|앉아|테이블/],
  meal_after_group: [/밥|식사|모임|끝나고|둘만/],
  walk_after_work: [/퇴근|걷|집에 가|저녁|피곤/],
  late_night_dm: [/밤|늦|톡|DM|답장/],
  campus_or_office_break: [/쉬는 시간|잠깐|학교|직장|사무실/],
  concern_shared: [/아까 말한|털어놓|힘들다고|고민/],
  faith_topic_arose: [/교회|신앙|그 얘기|아까 말한/]
};
```

중반 이후 setting 단서가 반드시 매번 나올 필요는 없다. 단, 완전히 사라지거나 모순되면 flag.

### 10.6 응답 길이 측정

#### 함수

```js
function responseLengthStats(messages) {}
```

#### 기준

- assistant 응답 중 1~3문장 비율 80% 이상
- 4문장 초과가 2회 이상이면 `too-many-long-responses`

### 10.7 QA 점수 산정

각 케이스에 점수를 추가한다.

```ts
type QualityScore = {
  total: number; // 100
  personaFidelity: number; // 25
  repetitionControl: number; // 25
  barrierRetention: number; // 25
  settingContinuity: number; // 15
  responseDiscipline: number; // 10
};
```

감점 예시:

- internal leak: -25
- role reversal: -20
- too fast conversion: -25
- repeated question structure: -15
- reasked topic: -20
- barrier missing: -20
- setting faded: -10
- too many long responses: -10

### 10.8 QA markdown 출력 변경

Summary table:

```markdown
| Case | Status | Score | Flags | Priority |
|---|---:|---:|---|---|
```

각 case detail:

```markdown
## interactive-kim-first-cafe-listen

- Score: 82
- Status: review
- Priority: P1
- Flags: repeated-question-structure

### Quality Notes
- Persona fidelity:
- Repetition:
- Barrier retention:
- Setting continuity:
- Response discipline:

### Transcript
...
```

### 10.9 수정 우선순위 산정

```js
function priorityForEvaluation(evaluation) {
  if (evaluation.flags.includes("internal-leak")) return "P0";
  if (evaluation.flags.includes("too-fast-conversion")) return "P0";
  if (evaluation.flags.includes("possible-role-reversal")) return "P0";
  if (evaluation.flags.includes("reasked-already-covered-topic")) return "P1";
  if (evaluation.flags.includes("repeated-question-structure")) return "P1";
  if (evaluation.flags.includes("persona-barrier-missing")) return "P1";
  return "P2";
}
```

## 11. 구현 순서

### Step 1: 데이터 스키마 추가

파일: `data/personas.json`

작업:

1. 모든 페르소나의 `roleplayTemplate`에 `coreStack` 추가.
2. 모든 페르소나의 `roleplayTemplate`에 `badResponsePatterns` 추가.
3. 모든 페르소나의 `roleplayTemplate`에 `imperfectionPattern` 추가.
4. 모든 페르소나의 `roleplayTemplate`에 `pasMap` 추가.
5. 모든 페르소나의 `roleplayTemplate`에 `fewShotResponses` 추가.

검증:

```powershell
node -e "const p=require('./data/personas.json'); for (const x of p) { const r=x.roleplayTemplate; if (!r.coreStack || !r.pasMap?.length || !r.badResponsePatterns?.length) throw new Error(x.id); } console.log('ok')"
```

주의:

- 이 repo는 `"type": "module"`이라 위 명령이 실패할 수 있다. 실패하면 `node --input-type=module -e "import p from './data/personas.json' with { type: 'json' }; ..."`를 사용한다.

### Step 2: 서버 helper 추가

파일: `server.js`

추가 함수:

1. `lastUserMessage()`
2. `recentAssistantMessages()`
3. `detectUserMove()`
4. `selectPasEntries()`
5. `formatRuntimeCard()`
6. `conversationStateHints()`
7. `formatPasExecutionPlan()`

위치는 `formatMessages()` 아래 또는 `conversationPhase()` 위가 적절하다.

검증:

- `node --check server.js`
- `/api/start` 정상 응답
- `/api/chat` 정상 응답

### Step 3: prompt assembly 변경

파일: `server.js`

변경 함수:

- `buildSessionBlock()`
- `initialPromptFor()`
- `chatPromptFor()`
- `buildFeedbackSessionBlock()`

검증:

- `chatPromptFor()` 출력에 다음 블록이 포함되어야 한다.
  - `페르소나 실행 카드`
  - `대화 상태 요약`
  - `이번 턴 페르소나 실행 계획`

### Step 4: 시스템 프롬프트 변경

파일: `prompts/persona-system-prompt.md`

작업:

- 내부 응답 절차 추가
- runtimeCard 사용법 추가
- 역할 뒤집힘 방지 예시 추가
- few-shot 복사 금지 규칙 추가

검증:

- "PAS", "runtimeCard", "내부 응답 절차" 키워드가 존재해야 한다.
- 최종 응답에는 내부 판단을 출력하지 말라는 지시가 있어야 한다.

### Step 5: 피드백 프롬프트 유지 확인

파일: `prompts/feedback-prompt.md`

작업:

- 사용자에게 노출되는 피드백 리포트에 시뮬레이션 품질 점검 섹션을 추가하지 않는다.
- 실행용 runtime card 전체가 피드백 입력으로 들어가지 않는지 확인한다.
- 기존 전도 훈련 피드백 구조가 유지되는지 확인한다.

검증:

- 출력 형식에 `## 시뮬레이션 품질 점검`이 없어야 한다.
- 피드백 리포트가 사용자 전도 훈련 개선에 집중해야 한다.

### Step 6: QA 스크립트 강화

파일: `scripts/qa-interactive-roleplay.mjs`

작업:

- quality score 추가
- 반복 질문 탐지 추가
- 장벽 유지 탐지 추가
- setting continuity 탐지 추가
- markdown summary 확장

검증:

```powershell
$env:OPENAI_API_KEY="..."
$env:OPENAI_CHAT_MODEL="gpt-5.4-mini"
$env:QA_USER_MODEL="gpt-5.4-mini"
$env:QA_TURNS="10"
node scripts\qa-interactive-roleplay.mjs
```

성공 조건:

- markdown, json 결과가 `docs/qa-runs`에 생성된다.
- 각 case에 score와 priority가 표시된다.

### Step 7: 회귀 QA

최소 실행:

```powershell
$env:QA_ONLY="interactive-kim-first-cafe-listen,interactive-park-pressure-resistance"
node scripts\qa-interactive-roleplay.mjs
```

전체 실행:

```powershell
node scripts\qa-interactive-roleplay.mjs
```

합격 기준:

- P0 flag 0개
- 전체 평균 score 80 이상
- 각 case score 70 이상
- repeated-question-structure는 전체 6개 case 중 1개 이하
- possible-role-reversal 0개
- too-fast-conversion 0개

## 12. P0/P1/P2 구현 범위

### P0

반드시 한 번에 구현한다.

- `coreStack`
- `badResponsePatterns`
- `conversationStateHints()`
- `formatRuntimeCard()`
- 시스템 프롬프트 내부 응답 절차
- 피드백 프롬프트는 사용자 전도 훈련 피드백 중심으로 유지

P0 성공 기준:

- 기존보다 역할 뒤집힘과 재질문이 줄어야 한다.
- QA에서 `possible-role-reversal`, `too-fast-conversion`이 0이어야 한다.

### P1

P0 이후 바로 구현한다.

- `pasMap`
- `formatPasExecutionPlan()`
- few-shot good/bad
- QA quality score

P1 성공 기준:

- 페르소나별 반응 목적이 선명해져야 한다.
- 같은 복음 설명에도 페르소나마다 다른 장벽이 나와야 한다.

### P2

품질 안정화 작업.

- QA 케이스 24개 확장
- 반복 질문 탐지 정교화
- setting continuity 탐지 정교화
- runtime card 길이 최적화

P2 성공 기준:

- 새 페르소나 추가 시 스키마 검증과 QA 확장이 쉬워야 한다.

## 13. 위험 요소와 대응

### 13.1 프롬프트 길이 증가

위험:

- runtime card, pasMap, few-shot이 추가되면 입력 토큰이 증가한다.
- 모델이 핵심 규칙보다 예시에 끌려갈 수 있다.

대응:

- `formatRuntimeCard()`에서 pasMap 최대 10개, few-shot good/bad 각 2개로 제한.
- 전체 `roleplayTemplate` JSON을 채팅 입력에 그대로 넣지 않는다.
- 피드백에는 평가용 압축 정보만 넣는다.

### 13.2 예시 답변 복사

위험:

- 모델이 `example`이나 few-shot 응답을 그대로 출력할 수 있다.

대응:

- 시스템 프롬프트에 "그대로 복사하지 말라"를 명시.
- QA에 `few-shot-copying` flag 추가.
- example은 너무 매력적인 문장보다 구조가 분명한 문장으로 작성.

### 13.3 페르소나가 너무 완고해짐

위험:

- 장벽 유지 규칙 때문에 좋은 경청에도 변화가 없는 캐릭터가 될 수 있다.

대응:

- `lateSessionTension.healthyMovement`를 반드시 유지.
- PAS의 `purpose`에 "완전 수긍"이 아니라 "질문의 질 변화"를 넣는다.
- QA에서 barrier retention과 healthy movement를 둘 다 본다.

### 13.4 휴리스틱 오분류

위험:

- `detectUserMove()`가 복합 발화를 잘못 분류할 수 있다.

대응:

- 감지 결과는 강제 지시가 아니라 참고 정보로 프롬프트에 넣는다.
- "대화 기록과 맞지 않으면 더 자연스러운 PAS를 내부적으로 선택" 지시를 포함한다.
- 필요하면 P3에서 state planner 모델 호출을 도입한다.

### 13.5 사용자 피드백과 QA 리포트의 역할 혼합

위험:

- 사용자에게 제공되는 피드백 리포트에 개발용 시뮬레이션 품질 점검이 섞이면, 사용자가 무엇을 개선해야 하는지 흐려질 수 있다.

대응:

- 사용자 피드백 리포트는 전도 대화 피드백에 집중한다.
- AI 상대역 품질 점검은 `scripts/qa-interactive-roleplay.mjs`의 QA 리포트에만 남긴다.
- QA 리포트에는 상대역 문제를 명확히 flag로 남기되, 사용자-facing 피드백에는 별도 섹션으로 노출하지 않는다.

## 14. 수동 검수 체크리스트

### 14.1 데이터 검수

- 모든 페르소나에 `coreStack`이 있는가
- 모든 페르소나에 `pasMap` 8개 이상이 있는가
- 모든 PAS entry에 `id`, `trigger`, `userMove`, `purpose`, `action`, `pressure`, `avoid`, `example`이 있는가
- bad response가 실제 실패 패턴을 구체적으로 적고 있는가
- few-shot bad가 금지 이유를 포함하는가

### 14.2 프롬프트 검수

- 내부 판단을 출력하지 말라는 지시가 있는가
- PAS 후보를 그대로 복사하지 말라는 지시가 있는가
- 사용자에게 상담 질문을 던지지 말라는 지시가 예시와 함께 있는가
- 관계/상황 설정 유지 지시가 있는가
- 회심/완전 수긍 금지가 유지되는가

### 14.3 서버 검수

- `chatPromptFor()` 출력에 전체 대화가 포함되는가
- `conversationStateHints()`가 빈 대화에서도 안전하게 작동하는가
- `formatPasExecutionPlan()`이 마지막 user 메시지가 없을 때도 안전한 fallback을 주는가
- `formatRuntimeCard()`가 신규 필드가 없는 구버전 페르소나에서도 깨지지 않는가

### 14.4 QA 검수

- QA user-agent가 고정 스크립트처럼 말하지 않는가
- 각 case가 최소 10턴 실행되는가
- markdown 결과에 score, flags, priority가 나오는가
- transcript가 남아 수동 검수가 가능한가

## 15. 완료 기준

구현 완료는 다음 조건을 모두 만족해야 한다.

1. `node --check server.js` 통과
2. `node --check public/app.js` 통과
3. `data/personas.json` JSON parse 통과
4. `/api/start` smoke test 통과
5. `/api/chat` smoke test 통과
6. `scripts/qa-interactive-roleplay.mjs` 최소 2개 case 통과
7. 전체 6개 기본 QA case에서 P0 flag 0개
8. QA 결과 markdown과 json이 `docs/qa-runs`에 저장됨
9. 피드백 결과에 `## 시뮬레이션 품질 점검` 섹션이 출력되지 않음
10. QA 결과에는 상대역 품질 flags와 score가 기록됨
11. 새 명세와 실제 구현이 어긋나는 부분이 없도록 문서 업데이트

## 16. 구현 후 예상 효과

- 반복 질문이 줄어든다.
- 페르소나별 반응 목적이 더 선명해진다.
- "설정 읽는 캐릭터" 느낌보다 "상황 속 상대역" 느낌이 강해진다.
- 사용자 피드백은 전도 훈련에 집중하고, AI 상대역 품질은 QA 리포트에서 분리 관리할 수 있다.
- QA가 향후 프롬프트 회귀를 더 빨리 잡을 수 있다.

## 17. 다음 단계

이 명세서 기준으로 실제 구현을 진행할 때는 다음 순서가 가장 안전하다.

1. `data/personas.json`에 `coreStack`, `badResponsePatterns`, `imperfectionPattern` 먼저 추가.
2. `server.js`에 helper 함수 추가.
3. `chatPromptFor()`에 상태 요약만 먼저 연결.
4. 짧은 QA 2개 케이스 실행.
5. `pasMap`과 few-shot 추가.
6. 전체 QA 6개 케이스 실행.
7. QA score를 기준으로 프롬프트 회귀를 확인.

한 번에 모든 것을 넣을 수는 있지만, 실제 품질 문제를 분리해서 보려면 P0와 P1을 나누어 검증하는 편이 낫다.
