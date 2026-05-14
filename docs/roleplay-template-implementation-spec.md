# 페르소나 단기 대화 템플릿 개선 구현 기획서

## 1. 목적

현재 앱은 복음 전도 대화를 10~30분 정도 연습하고, 종료 후 피드백을 받는 단회성 훈련 도구다.
따라서 장기 기억, 며칠에 걸친 관계 서사, 복잡한 상태 머신은 필요하지 않다.

이번 구현의 목적은 다음 세 가지다.

1. 대화 단계가 너무 빨리 마무리로 넘어가지 않도록 조정한다.
2. 페르소나별 말투 힌트가 반복 문구로 굳어지는 문제를 줄인다.
3. 피드백 생성에는 캐릭터 실행용 프롬프트를 넣지 않고, 평가에 필요한 정보만 넣는다.

## 2. 구현 범위

### 포함

- `server.js`의 `conversationPhase()` 개선
- `server.js`의 `chatPromptFor()`가 개선된 대화 단계 정보를 사용하도록 수정
- `data/personas.json`의 `이전 말투 필드` 필드를 `phraseHints`로 변경
- `prompts/persona-system-prompt.md`에 반복 말투 방지 규칙 추가
- `server.js`에 `buildFeedbackSessionBlock()` 추가
- `feedbackInputFor()`가 `buildSessionBlock()` 대신 `buildFeedbackSessionBlock()`을 사용하도록 수정

### 제외

- 장기 기억 기능
- 벡터 DB 또는 RAG
- 사용자 계정/로그인
- DB 저장
- 실시간 스트리밍
- 자동 평가 테스트 코드
- UI 변경

## 3. 현재 구조 요약

### 주요 파일

- `server.js`
  - OpenAI API 호출
  - 세션 프롬프트 조립
  - 시작 응답, 채팅 응답, 피드백 응답 라우팅

- `data/personas.json`
  - 페르소나 카드
  - `roleplayTemplate`
  - 현재 `roleplayTemplate.speechStyle.이전 말투 필드` 포함

- `prompts/persona-system-prompt.md`
  - 캐릭터 응답용 시스템 프롬프트
  - 대화 규칙, 목적 제한, 단기 템플릿 사용법 포함

- `prompts/feedback-prompt.md`
  - 피드백 생성용 시스템 프롬프트

## 4. 변경 1: 대화 단계 개선

### 문제

현재 `server.js`의 `conversationPhase()`는 사용자 발화 수 기준으로 다음처럼 작동한다.

```js
if (userTurns <= 2) return "초반";
if (userTurns <= 6) return "중반";
return "마무리";
```

이 방식은 7번째 사용자 발화부터 바로 마무리 단계로 들어간다.
10~30분 훈련에서는 너무 빠르다.
대화가 아직 본론으로 들어가고 있는데 모델이 다음 대화 약속이나 여운으로 닫으려 할 수 있다.

### 목표 동작

대화 단계는 사용자 턴 수, 복음 주제 등장 여부, 고민 주제 등장 여부를 함께 본다.
단, 실제 종료는 사용자가 `종료하고 피드백` 버튼으로 결정하므로, 모델은 대화를 강제로 닫으면 안 된다.

### 단계 기준

```text
0턴: 시작 발화
1~3턴: 관계 형성 / 상황 진입
4~8턴: 고민 탐색 / 장벽 노출
9~14턴: 복음 연결 / 핵심 질문
15턴 이후: 마무리 가능 상태
```

### 구현 대상

파일: `server.js`

기존 함수:

```js
function conversationPhase(messages = []) {
  const userTurns = messages.filter((message) => message.role === "user").length;
  if (userTurns <= 2) return "초반: 관계와 상황을 확인하며 너무 빨리 결론으로 가지 않는다.";
  if (userTurns <= 6) return "중반: 상대의 고민과 복음 장벽을 더 구체적으로 드러낸다.";
  return "마무리: 대화가 길어졌으므로 다음 대화, 질문, 여운 중 하나로 자연스럽게 이어질 수 있다.";
}
```

수정 후 함수:

```js
function conversationPhase(messages = []) {
  const userTurns = messages.filter((message) => message.role === "user").length;
  const conversationText = messages.map((message) => message.content || "").join("\n");

  const hasFaithTopic = /하나님|예수|복음|죄|십자가|부활|믿음|교회|구원/.test(conversationText);
  const hasConcern = /힘들|불안|고민|외롭|상처|회의|두렵|지쳤|취업|진로|성공|인정|비교|허무|통제|실패/.test(conversationText);

  if (userTurns <= 3) {
    return [
      "초반: 관계와 상황에 자연스럽게 들어간다.",
      "아직 깊은 결론이나 회심 반응으로 가지 않는다.",
      "상대는 자기 고민을 암시할 수 있지만 길게 털어놓지는 않는다."
    ].join("\n");
  }

  if (userTurns <= 8) {
    return [
      "탐색: 사용자의 경청 정도에 따라 고민이나 복음 장벽을 조금 더 드러낸다.",
      hasConcern
        ? "이미 고민이 나왔으므로 그 고민의 뿌리나 감정을 한 단계 더 구체화한다."
        : "아직 고민이 충분히 드러나지 않았으므로 일상과 상황 속에서 자연스럽게 드러낸다.",
      "복음 설명을 들으면 즉시 동의하지 말고 페르소나의 장벽에 맞는 질문을 한다."
    ].join("\n");
  }

  if (userTurns <= 14) {
    return [
      "연결: 신앙이나 복음 이야기가 자연스럽게 오갈 수 있는 단계다.",
      hasFaithTopic
        ? "이미 신앙 주제가 나왔으므로 페르소나별 gospelReactionMap에 맞춰 반응한다."
        : "아직 신앙 주제가 직접 나오지 않았다면 억지로 끌어오지 말고, 고민과 가치관을 더 선명히 드러낸다.",
      "한 번의 대화에서 바로 설득되거나 회심하지 않는다."
    ].join("\n");
  }

  return [
    "마무리 가능: 대화가 충분히 진행되었으므로 다음 질문, 여운, 다음 대화 가능성을 남길 수 있다.",
    "단, 사용자가 계속 깊게 묻고 있다면 대화를 억지로 닫지 않는다.",
    "결론 강요보다 생각해볼 지점 하나를 남기는 쪽이 자연스럽다."
  ].join("\n");
}
```

### 주의점

- 함수 인자는 기존처럼 `messages = []`만 유지해도 된다.
- `goal`까지 넣는 확장은 현재 단계에서는 불필요하다.
- 정규식은 완벽한 분류기가 아니라 가벼운 힌트다.
- `hasFaithTopic`, `hasConcern`이 틀려도 치명적 오류가 나지 않도록 문구는 부드럽게 작성한다.

### 수용 기준

- 사용자 7턴째에도 마무리 단계가 아니라 `연결` 이전 또는 `탐색` 흐름을 유지한다.
- 사용자 15턴 이후에도 대화를 강제로 닫지 않고 “마무리 가능”으로만 안내한다.
- 신앙 주제가 아직 나오지 않았을 때 모델이 억지로 복음을 끌어오지 않도록 지시가 포함된다.

## 5. 변경 2: 반복 말투 방지

### 문제

현재 `data/personas.json`의 각 페르소나에는 다음 필드가 있다.

```json
"이전 말투 필드": ["아 진짜...", "그냥 좀 그렇더라", "나만 이런가 싶고"]
```

`이전 말투 필드`라는 이름은 모델에게 “이 표현을 자주 써라”로 해석될 수 있다.
짧은 채팅에서는 같은 문구가 몇 번만 반복되어도 캐릭터가 기계적으로 느껴진다.

### 목표 동작

표현은 그대로 반복하는 문구가 아니라 말투 참고용 힌트로 사용한다.

### 데이터 변경

파일: `data/personas.json`

모든 `roleplayTemplate.speechStyle.이전 말투 필드`를 `phraseHints`로 변경한다.

변경 전:

```json
"이전 말투 필드": ["아 진짜...", "그냥 좀 그렇더라", "나만 이런가 싶고"]
```

변경 후:

```json
"phraseHints": ["아 진짜...", "그냥 좀 그렇더라", "나만 이런가 싶고"]
```

### 대상 위치

다음 6개 페르소나 모두 수정한다.

- `kim-sihyun`
- `park-doyoon`
- `jung-haeun`
- `choi-minjae`
- `oh-yujin`
- `han-seojun`

### 시스템 프롬프트 변경

파일: `prompts/persona-system-prompt.md`

`## 단기 대화 템플릿 사용법` 아래에 다음 규칙을 추가한다.

```text
- phraseHints는 말투 참고용이다. 같은 표현을 반복적으로 그대로 사용하지 말고, 의미와 리듬만 참고해 자연스럽게 변형한다.
```

기존에 `이전 말투 필드`를 설명하는 문장은 없으므로 새 문장만 추가하면 된다.

### 문서 변경

파일: `docs/persona-roleplay-template.md`

JSON 예시에서 `이전 말투 필드`를 `phraseHints`로 바꾼다.

변경 전:

```json
"이전 말투 필드": ["자주 쓰는 표현"]
```

변경 후:

```json
"phraseHints": ["말투 참고 표현"]
```

작성 기준에 다음 문장을 추가한다.

```text
- phraseHints는 실제 출력에 반복 삽입하는 문구가 아니라 리듬과 어휘 감각을 잡기 위한 참고값이다.
```

### 수용 기준

- `data/personas.json`에 `이전 말투 필드` 문자열이 남아 있지 않다.
- `phraseHints`는 6개 페르소나 모두에 존재한다.
- 시스템 프롬프트에 반복 금지 지시가 포함된다.

## 6. 변경 3: 피드백 입력 분리

### 문제

현재 `feedbackInputFor()`는 `buildSessionBlock()`을 그대로 사용한다.

```js
function feedbackInputFor(session, persona, messages) {
  return [
    "세션 정보:",
    buildSessionBlock(session, persona),
    "",
    "전체 대화 기록:",
    formatMessages(messages),
    "",
    "위 대화를 평가 기준과 출력 형식에 맞춰 한국어로 피드백하라."
  ].join("\n");
}
```

`buildSessionBlock()`은 캐릭터 응답 생성을 위한 실행 프롬프트다.
여기에는 다음 내용이 포함된다.

- 목적 제한
- 일반 잡담/연애 롤플레이 방지 지침
- 단회성 훈련 운영 원칙
- 페르소나 카드 전체
- 페르소나별 단기 대화 템플릿 전체

피드백 모델은 캐릭터로 응답할 필요가 없다.
평가에 필요한 정보만 있으면 된다.
현재 방식은 토큰을 낭비하고, 평가 프롬프트의 초점을 흐릴 수 있다.

### 목표 동작

피드백 입력에는 다음 정보만 넣는다.

- 세션 설정
- 페르소나 핵심 정보
- 복음 장벽
- 대화 반응 규칙
- 단기 세션 한계
- 전체 대화 기록

### 구현 대상

파일: `server.js`

새 함수 추가:

```js
function formatList(items = []) {
  return items.length ? items.join(" / ") : "없음";
}

function buildFeedbackSessionBlock(session, persona) {
  return [
    "세션 설정:",
    `- 페르소나: ${persona.name} (${persona.title})`,
    `- 관계: ${relationshipLabels[session.relationship] || session.relationship}`,
    `- 시작 상황: ${settingLabels[session.setting] || session.setting}`,
    `- 대화 목표: ${goalLabels[session.goal] || session.goal}`,
    "",
    "페르소나 핵심 정보:",
    `- 배경: ${persona.background || "없음"}`,
    `- 내면 갈등: ${formatList(persona.innerConflicts)}`,
    `- 복음 장벽: ${formatList(persona.gospelBarriers)}`,
    `- 대화 반응 규칙: ${formatList(persona.conversationRules)}`,
    "",
    "단기 세션 한계:",
    formatList(persona.roleplayTemplate?.shortSessionBoundaries)
  ].join("\n");
}
```

기존 `feedbackInputFor()` 수정:

```js
function feedbackInputFor(session, persona, messages) {
  return [
    "세션 정보:",
    buildFeedbackSessionBlock(session, persona),
    "",
    "전체 대화 기록:",
    formatMessages(messages),
    "",
    "위 대화를 평가 기준과 출력 형식에 맞춰 한국어로 피드백하라."
  ].join("\n");
}
```

### 함수 위치

`formatList()`와 `buildFeedbackSessionBlock()`는 `buildSessionBlock()` 근처에 둔다.
권장 위치:

```text
formatPersonaCard()
formatList()
buildSessionBlock()
buildFeedbackSessionBlock()
initialPromptFor()
chatPromptFor()
feedbackInputFor()
```

또는 `buildFeedbackSessionBlock()`을 `feedbackInputFor()` 바로 위에 두어도 된다.

### 주의점

- `buildFeedbackSessionBlock()`에서는 `guardrailPrompt`를 넣지 않는다.
- `roleplayTemplate` 전체를 넣지 않는다.
- `speechStyle`, `phraseHints`는 피드백 평가에는 직접 필요하지 않으므로 제외한다.
- `shortSessionBoundaries`는 포함한다. 사용자가 한 번의 대화에서 과도한 회심을 요구했는지 평가하는 데 유용하다.
- 피드백 시스템 프롬프트는 기존 `feedbackPrompt`를 그대로 사용한다.

### 수용 기준

- `feedbackInputFor()`가 더 이상 `buildSessionBlock()`을 호출하지 않는다.
- 피드백 입력에 캐릭터 실행용 guardrail이 포함되지 않는다.
- 피드백은 페르소나의 복음 장벽과 단기 세션 한계를 기준으로 평가할 수 있다.

## 7. 권장 구현 순서

1. `data/personas.json`에서 `이전 말투 필드`를 `phraseHints`로 변경한다.
2. `prompts/persona-system-prompt.md`에 `phraseHints` 반복 방지 규칙을 추가한다.
3. `docs/persona-roleplay-template.md`의 예시를 `phraseHints` 기준으로 수정한다.
4. `server.js`의 `conversationPhase()`를 개선한다.
5. `server.js`에 `formatList()`와 `buildFeedbackSessionBlock()`을 추가한다.
6. `feedbackInputFor()`가 `buildFeedbackSessionBlock()`을 사용하도록 바꾼다.
7. 문법과 JSON 파싱을 검증한다.

## 8. 검증 명령

PowerShell 기준:

```powershell
node --check server.js
node -e "JSON.parse(require('fs').readFileSync('data/personas.json','utf8')); console.log('personas.json OK')"
rg "이전 말투 필드" data prompts docs server.js
rg "phraseHints" data prompts docs
```

기대 결과:

- `node --check server.js`가 출력 없이 성공한다.
- `personas.json OK`가 출력된다.
- `이전 말투 필드` 검색 결과가 없다.
- `phraseHints` 검색 결과가 `data/personas.json`, `prompts/persona-system-prompt.md`, `docs/persona-roleplay-template.md`에서 확인된다.

서버 실행 확인:

```powershell
$env:PORT = '4174'
node server.js
```

다른 터미널에서:

```powershell
$personas = Invoke-RestMethod -Uri 'http://localhost:4174/data/personas.json'
$missing = $personas | Where-Object { -not $_.roleplayTemplate.speechStyle.phraseHints }
if ($missing) { "missing phraseHints: $($missing.id -join ', ')" } else { "all personas have phraseHints" }
```

## 9. 수동 QA 시나리오

### 시나리오 A: 초반 과도한 고백 방지

조건:

- 페르소나: 김시현
- 관계: 처음 만난 사람
- 상황: 카페
- 사용자 1턴: “요즘 진짜 힘들어 보여. 무슨 일 있어?”

기대:

- 페르소나는 바로 깊은 고백을 길게 하지 않는다.
- 취업/불안 힌트는 줄 수 있지만, 처음부터 모든 내면 갈등을 풀어놓지 않는다.

### 시나리오 B: 중반 장벽 노출

조건:

- 페르소나: 박도윤
- 사용자 5턴 전후
- 사용자가 “부활이 진짜라면 근거가 있을 것 같긴 한데, 너는 어떤 게 걸려?”처럼 묻는다.

기대:

- 페르소나는 논리, 근거, 성경 신뢰성, 부활 역사성 쪽 질문을 한다.
- 감정적으로 갑자기 마음을 여는 반응을 하지 않는다.

### 시나리오 C: 복음 연결 단계

조건:

- 페르소나: 한서준
- 사용자 10턴 전후
- 사용자가 죄와 십자가를 설명한다.

기대:

- 페르소나는 “왜 선행이 아니라 예수님의 십자가가 필요한지” 묻는다.
- 바로 수긍하거나 회심하지 않는다.

### 시나리오 D: 마무리 가능 단계

조건:

- 사용자 15턴 이후
- 사용자가 계속 질문한다.

기대:

- 페르소나는 대화를 강제로 닫지 않는다.
- 다만 다음에 더 이야기해볼 질문이나 여운을 남길 수 있다.

### 시나리오 E: 반복 말투 확인

조건:

- 같은 페르소나와 8턴 이상 대화한다.

기대:

- `phraseHints`의 문장이 그대로 반복되지 않는다.
- 말투 리듬은 유지되지만 표현은 자연스럽게 변형된다.

### 시나리오 F: 피드백 초점 확인

조건:

- 대화를 종료하고 피드백 생성

기대:

- 피드백은 캐릭터 연기 지침을 설명하지 않는다.
- 사용자의 경청, 복음 명확성, 페르소나 장벽 대응을 중심으로 평가한다.
- “페르소나별 단기 대화 템플릿에 따르면” 같은 내부 구현 표현을 노출하지 않는다.

## 10. 비목표 설명

이번 작업은 품질을 안정화하는 소규모 개선이다.
다음 기능은 의도적으로 넣지 않는다.

### 장기 기억

사용자는 같은 사람과 며칠씩 이어지는 대화를 하지 않는다.
대화는 길어도 10~30분 안에 끝난다.
따라서 사용자별 장기 기억, DB 저장, 벡터 검색은 지금 목적에 비해 과하다.

### 복잡한 상태 머신

신뢰도, 방어감, 복음 진입도를 숫자로 추적하는 상태 머신도 만들 수 있지만 지금은 필요하지 않다.
전체 메시지를 프롬프트에 넣는 현재 방식으로도 단기 대화는 충분히 유지된다.
대신 `conversationPhase()`를 개선해 모델에게 현재 대화 위치만 알려준다.

### 자동 테스트

LLM 응답은 비결정적이므로 일반 단위 테스트와 맞지 않는다.
이번 단계에서는 수동 QA 시나리오로 충분하다.
추후 품질이 중요해지면 페르소나별 샘플 대화와 평가 기준을 별도 문서로 만들 수 있다.

## 11. 완료 정의

작업은 다음 조건을 모두 만족하면 완료로 본다.

- `conversationPhase()`가 4단계 기준으로 개선되어 있다.
- `이전 말투 필드`가 전부 `phraseHints`로 바뀌어 있다.
- 시스템 프롬프트에 `phraseHints` 반복 방지 규칙이 있다.
- 피드백 입력이 `buildFeedbackSessionBlock()`을 통해 구성된다.
- `feedbackInputFor()`가 `buildSessionBlock()`을 호출하지 않는다.
- `node --check server.js`가 통과한다.
- `data/personas.json` 파싱이 통과한다.
- 수동 QA에서 초반, 중반, 연결, 마무리 가능 단계가 어색하지 않다.


