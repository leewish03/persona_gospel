# 훈련 기록/관리자/운영 기능 구현 명세서

## 1. 목표

현재 앱은 로그인, 프로필, 페르소나 선택, 채팅, 피드백, 기본 기록 저장까지 동작한다. 다음 구현 목표는 앱을 "한 번 해보는 채팅"이 아니라 반복 훈련과 운영이 가능한 도구로 확장하는 것이다.

이번 범위에서 하지 않는 것:

- 소그룹/리더 모드
- 결제 기능
- 사용자별 강한 과금 제한
- 페르소나 품질 개선 작업

이번 범위에서 하는 것:

- 훈련 기록 상세 화면
- 대화 전문/피드백 재조회
- 같은 설정으로 다시 훈련하기
- 기록 필터/검색
- 성장 요약
- 관리자 사용자/대화/사용량 화면
- 후원 안내 영역 구조화
- 월 사용량/비용 추정 표시
- Supabase 저장소 전환 준비 및 구현

## 2. 구현 원칙

1. 기존 사용자 흐름을 깨지 않는다.
2. Supabase 계정 정보가 없어도 로컬 개발은 계속 가능해야 한다.
3. Supabase 환경변수가 있으면 Supabase를 우선 사용한다.
4. 개인정보와 대화 전문은 관리자 화면에서 과하게 노출하지 않는다.
5. 사용량 제한은 강한 차단보다 "비정상적으로 과한 사용 방지" 수준으로 둔다.
6. 후원은 결제가 아니라 자발적 후원 안내로 처리한다.

## 3. 저장소 전환 구조

### 3.1 현재 구조

현재 `server.js`는 `storage/db.json`에 아래 데이터를 저장한다.

- users
- conversations

세션은 서버 메모리 `Map`에 저장한다.

### 3.2 목표 구조

저장소 어댑터를 분리한다.

```text
server.js
  -> storage/index.js
      -> json-storage.js
      -> supabase-storage.js
```

선택 규칙:

```text
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 존재
  -> SupabaseStorage 사용
없음
  -> JsonStorage 사용
```

필요 환경변수:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
```

서버에서 쓰는 키는 `SUPABASE_SERVICE_ROLE_KEY`다. 클라이언트에는 노출하지 않는다.

## 4. Supabase 데이터 모델

Supabase Auth는 당장 사용하지 않는다. 현재 Google/Kakao OAuth 로그인 구조를 유지하고, Supabase는 애플리케이션 DB로만 사용한다.

### 4.1 app_users

```sql
create table public.app_users (
  id uuid primary key,
  provider text not null,
  provider_id text not null,
  email text,
  display_name text,
  avatar_url text,
  role text not null default 'user',
  profile jsonb not null default '{}'::jsonb,
  disabled_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_id)
);
```

### 4.2 conversations

```sql
create table public.conversations (
  id uuid primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  persona_id text not null,
  relationship text not null,
  setting text not null,
  goal text not null,
  status text not null default 'active',
  feedback_text text,
  feedback_summary text,
  message_count integer not null default 0,
  user_message_count integer not null default 0,
  assistant_message_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
```

### 4.3 conversation_messages

```sql
create table public.conversation_messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);
```

### 4.4 usage_events

```sql
create table public.usage_events (
  id uuid primary key,
  user_id uuid references public.app_users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  event_type text not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  estimated_cost_krw numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);
```

### 4.5 app_settings

```sql
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

사용 예:

```json
{
  "donation": {
    "title": "후원 안내",
    "body": "AI 호출 비용은 운영자가 부담합니다. 지속 운영을 돕고 싶다면 아래 계좌로 후원할 수 있습니다.",
    "account": "",
    "enabled": true
  },
  "cost": {
    "usdToKrw": 1380,
    "monthlyBudgetKrw": 0
  }
}
```

## 5. 서버 API 명세

### 5.1 훈련 기록 목록

```http
GET /api/conversations
```

쿼리:

```text
q=
personaId=
goal=
status=
from=
to=
limit=30
cursor=
```

응답:

```json
{
  "conversations": [
    {
      "id": "uuid",
      "personaId": "kim-sihyun",
      "relationship": "casual_friend",
      "setting": "cafe_catchup",
      "goal": "listen_and_understand",
      "status": "finished",
      "messageCount": 12,
      "feedbackSummary": "경청은 좋았지만 복음 연결이 늦었습니다.",
      "createdAt": "...",
      "updatedAt": "...",
      "finishedAt": "..."
    }
  ],
  "nextCursor": null
}
```

### 5.2 훈련 기록 상세

```http
GET /api/conversations/:id
```

응답:

```json
{
  "conversation": {
    "id": "uuid",
    "session": {},
    "messages": [],
    "feedbackText": "",
    "feedbackSummary": "",
    "status": "finished",
    "createdAt": "..."
  }
}
```

### 5.3 같은 설정으로 다시 훈련

클라이언트에서 기존 conversation의 `session` 값을 현재 선택값으로 복원하고 `review` 또는 `chat` 플로우로 보낸다.

서버 API는 새로 만들 필요가 없다. 기존 `/api/start`를 재사용한다.

### 5.4 성장 요약

```http
GET /api/me/stats
```

응답:

```json
{
  "totalConversations": 12,
  "finishedConversations": 9,
  "thisMonthConversations": 4,
  "byGoal": [
    { "goal": "listen_and_understand", "count": 3 }
  ],
  "byPersona": [
    { "personaId": "jung-haeun", "count": 2 }
  ],
  "recentFeedbackThemes": [
    "경청은 좋지만 복음 핵심 연결이 늦음",
    "질문은 좋지만 대화 마무리가 약함"
  ]
}
```

초기 버전에서는 `recentFeedbackThemes`를 AI로 재요약하지 않고, 최근 피드백에서 간단한 첫 문장/요약문만 추출한다. 별도 AI 요약은 비용이 늘기 때문에 후순위다.

### 5.5 관리자 요약

```http
GET /api/admin/summary
```

응답 확장:

```json
{
  "users": 10,
  "completedProfiles": 8,
  "conversations": 44,
  "finishedConversations": 31,
  "todayConversations": 5,
  "thisMonthConversations": 22,
  "estimatedMonthlyCostKrw": 1240,
  "estimatedMonthlyCostUsd": 0.9
}
```

### 5.6 관리자 사용자 목록

```http
GET /api/admin/users?q=&limit=50
```

응답:

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "이소원",
      "role": "user",
      "profile": {
        "name": "이소원",
        "age": "24",
        "gender": "여성",
        "church": "서울북부교회",
        "useCase": "CBF 활동"
      },
      "conversationCount": 4,
      "finishedConversationCount": 3,
      "lastActivityAt": "..."
    }
  ]
}
```

### 5.7 관리자 대화 목록

```http
GET /api/admin/conversations?q=&userId=&personaId=&goal=&limit=50
```

관리자 화면에서는 기본적으로 대화 전문을 바로 노출하지 않는다. 목록에는 메타데이터와 피드백 요약만 표시한다. 전문은 상세 버튼을 눌렀을 때만 표시한다.

### 5.8 관리자 설정

```http
GET /api/admin/settings
PUT /api/admin/settings
```

초기 설정 항목:

- 후원 안내 제목
- 후원 안내 문구
- 후원 계좌/링크
- 후원 안내 표시 여부
- 월 예산 기준
- 원/달러 환율 수동 입력

## 6. OpenAI 사용량/비용 추정

현재 OpenAI Responses API 호출 결과에서 usage가 있으면 저장한다. 없으면 메시지 길이 기반의 보수적 추정치를 저장한다.

저장 이벤트:

- `chat_start`
- `chat_message`
- `feedback`

환경변수:

```text
OPENAI_CHAT_INPUT_USD_PER_1M=
OPENAI_CHAT_OUTPUT_USD_PER_1M=
OPENAI_FEEDBACK_INPUT_USD_PER_1M=
OPENAI_FEEDBACK_OUTPUT_USD_PER_1M=
USD_TO_KRW=1380
```

초기값은 코드에 fallback으로 둔다. 정확한 가격은 모델 변경 시 운영자가 환경변수로 덮어쓴다.

관리자 화면 표시:

```text
이번 달 사용량
- 대화 시작: 30회
- 메시지 응답: 180회
- 피드백 생성: 24회
- 예상 비용: 약 2,430원
```

강한 사용량 제한은 하지 않는다. 다만 비정상 방지를 위해 아래 soft guard를 둔다.

- 한 대화 메시지 최대 30턴
- 한 메시지 최대 글자 수 제한
- 피드백 생성은 대화당 1회 기본
- 서버 오류/반복 클릭 방지

## 7. 프론트 화면 명세

### 7.1 훈련 기록 탭

구성:

- 상단 성장 요약
- 필터 영역
- 기록 카드 목록

성장 요약:

```text
총 12회 훈련
이번 달 4회
가장 많이 연습한 초점: 상대의 말 듣고 이해하기
최근 피드백: 복음 연결을 더 분명히 하기
```

필터:

- 검색어
- 페르소나
- 훈련 초점
- 완료/진행 중

기록 카드:

```text
정하은 · 완료
2026. 5. 15. 오후 10:14
오래된 친구 · 교회 이야기가 언급된 직후
훈련 초점: 장벽에 답하기
요약: 상처를 잘 들었지만 복음 연결이 늦었습니다.
[상세] [같은 설정으로 다시]
```

### 7.2 기록 상세 화면

현재 단일 페이지 구조를 유지하기 위해 `screen-history-detail`을 추가한다.

표시:

- 세션 정보
- 대화 전문
- 피드백 리포트
- 공유하기
- 같은 설정으로 다시 훈련하기

### 7.3 관리자 화면

현재 숫자 카드만 있는 관리자 화면을 탭/섹션형으로 바꾼다.

섹션:

- 개요
- 사용자
- 훈련 기록
- 사용량/비용
- 운영 설정

관리자 개요:

```text
가입 사용자
프로필 완료
전체 훈련
완료 훈련
오늘 훈련
이번 달 예상 비용
```

사용자 목록:

- 이메일
- 이름
- 소속 교회
- 사용 용도
- 훈련 수
- 마지막 활동

훈련 기록 목록:

- 사용자
- 페르소나
- 관계/상황/초점
- 메시지 수
- 완료 여부
- 생성일

운영 설정:

- 후원 안내 문구
- 후원 계좌/링크 입력
- 월 예산 기준 입력
- 환율 입력

### 7.4 설정 화면 후원 영역

현재 하드코딩된 후원 영역을 서버 설정 기반으로 렌더링한다.

후원 계좌가 비어 있으면:

```text
후원 안내는 준비 중입니다.
```

후원 계좌가 있으면:

```text
이 앱의 AI 호출 비용은 운영자가 부담합니다.
지속 운영을 돕고 싶다면 아래 안내를 통해 자발적으로 후원할 수 있습니다.

후원 계좌
...
```

## 8. 구현 순서

### 1단계: 저장소 어댑터

- `storage/json-storage.js`
- `storage/supabase-storage.js`
- `storage/index.js`
- 기존 `db` 직접 접근 제거
- JSON 저장소 기준 기존 기능 회귀 테스트

검수:

- 로그인
- 프로필 저장
- 대화 시작
- 메시지 저장
- 피드백 저장
- 기록 조회

### 2단계: Supabase 스키마/전환

- `docs/supabase-schema.sql` 작성
- Supabase REST 저장소 구현
- env 없으면 JSON fallback
- env 있으면 Supabase 사용

검수:

- Supabase env 없는 로컬 실행 성공
- Supabase env 있는 상태에서 CRUD 성공
- JSON DB와 응답 형식 동일

### 3단계: 기록 상세/다시 훈련

- `/api/conversations/:id`
- `screen-history-detail`
- 상세 보기
- 같은 설정으로 다시 훈련하기

검수:

- 기록 목록에서 상세 진입
- 대화 전문 표시
- 피드백 표시
- 같은 설정으로 새 훈련 시작

### 4단계: 성장 요약/필터

- `/api/me/stats`
- 기록 필터 UI
- 기록 카드 요약 개선

검수:

- 필터별 목록 변경
- 빈 결과 UI
- 모바일 화면에서 카드/필터 깨짐 없음

### 5단계: 관리자 확장

- `/api/admin/users`
- `/api/admin/conversations`
- `/api/admin/usage`
- `/api/admin/settings`
- 관리자 화면 섹션화

검수:

- 일반 사용자는 403
- 관리자만 접근 가능
- 사용자 목록/대화 목록/사용량 표시
- 설정 저장 후 설정 화면 반영

### 6단계: 사용량/비용 추정

- OpenAI usage 수집
- usage_events 저장
- 월 사용량 집계
- 관리자 화면 표시

검수:

- 대화 시작 시 usage 기록
- 채팅 응답 시 usage 기록
- 피드백 생성 시 usage 기록
- 월 예상 비용 표시

### 7단계: UI QA

대상 화면:

- 기록 목록
- 기록 상세
- 관리자 개요
- 관리자 사용자 목록
- 관리자 대화 목록
- 관리자 설정
- 설정 후원 영역

검수 뷰포트:

- 390 x 844
- 430 x 932
- 768 x 1024
- desktop 1280 이상

체크:

- 텍스트 겹침 없음
- 버튼 터치 영역 충분
- 긴 이메일/교회명 줄바꿈
- 목록 스크롤 정상
- 하단 탭과 콘텐츠 겹침 없음

## 9. 완료 기준

기능 완료 기준:

- Supabase env 없이 기존 JSON 저장소로 앱 전체 동작
- Supabase env가 있으면 Supabase에 사용자/대화/메시지/피드백/사용량 저장
- 기록 목록에서 상세 화면 진입 가능
- 기록 상세에서 같은 설정으로 다시 훈련 가능
- 관리자 화면에서 사용자/대화/사용량/설정 관리 가능
- 후원 안내는 설정만 넣으면 사용자 설정 화면에 표시

검수 완료 기준:

- 서버 문법 검사 통과
- 주요 API 수동 호출 통과
- 로컬 브라우저에서 핵심 플로우 확인
- 모바일 폭에서 UI 확인
- 기존 인증/채팅/피드백 흐름 회귀 없음

## 10. 리스크

1. Supabase 프로젝트가 아직 없으므로 실제 Supabase 연결 검수는 env를 받은 뒤 가능하다.
2. 현재 다른 에이전트가 `server.js`, prompt, QA 파일을 수정 중이므로 충돌 방지를 위해 작업 범위를 나누어야 한다.
3. `server.js`가 단일 파일이라 저장소 전환 시 충돌 가능성이 높다.
4. 대화 전문 관리자 노출은 개인정보 이슈가 있으므로 기본은 요약 중심으로 한다.
5. 비용 추정은 모델 가격/usage 응답 변화에 따라 실제 청구액과 다를 수 있다.

## 11. 바로 다음 작업

1. 저장소 어댑터 분리
2. JSON 저장소로 기존 동작 회귀 확인
3. Supabase 스키마 SQL 작성
4. 기록 상세 API/화면 구현
5. 관리자 화면 확장

