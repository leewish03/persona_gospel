# 배포 가이드

## 결론

코드 배포 자체는 가능하다. 다만 아래 작업은 사용자 계정 권한이 필요하다.

- 도메인 구매 또는 연결
- 호스팅 서비스 계정 생성
- OpenAI API Key 발급 및 결제 수단 등록
- Google OAuth 앱 등록
- Kakao OAuth 앱 등록
- 운영자 이메일과 후원 계좌/링크 결정

## 현재 앱 구조

- Node.js 단일 서버
- 정적 프론트엔드: `public`
- 페르소나 데이터: `data/personas.json`
- 프롬프트: `prompts`
- 사용자/대화 저장: Supabase 우선, JSON fallback은 `storage/db.json`
- 서버 소유 OpenAI API Key 사용

## 작은 MVP 배포

소규모 테스트라면 다음 구조로 충분하다.

```text
호스팅: Render / Railway / Fly.io 같은 Node 서버 호스팅
저장소: Supabase 또는 persistent disk의 storage/db.json
로그인: Google/Kakao OAuth
AI 비용: 운영자 OpenAI API Key
```

이 저장소에는 Render Blueprint용 `render.yaml`이 포함되어 있다.
Render에서 Blueprint로 연결하면 web service와 환경변수 슬롯이 함께 생성된다.

주의:

- Supabase를 쓰는 운영 환경에서는 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 반드시 설정한다.
- JSON fallback을 운영 저장소로 쓸 때만 persistent disk를 연결하고 `STORAGE_DIR`을 마운트 경로에 맞춘다.
- persistent disk 없이 JSON fallback으로만 운영하면 재배포/재시작 시 저장 데이터가 유실될 수 있다.
- 서버가 재시작되면 현재 로그인 세션은 풀릴 수 있다.
- 여러 서버 인스턴스를 동시에 띄우면 JSON 파일 저장 방식은 부적합하다.

## 안정적 운영 배포

사용자가 늘어날 가능성이 있으면 아래 구조가 맞다.

```text
호스팅: Render / Railway / Fly.io / VPS
DB: Postgres 또는 SQLite
세션 저장소: DB 또는 Redis
파일 저장: DB 중심
OAuth: Google/Kakao
```

현재 코드에서 안정적 운영으로 가려면 다음 리팩터링이 필요하다.

- `storage/db.json` 제거
- 사용자, 대화, 피드백을 DB 테이블로 저장
- 세션을 메모리가 아니라 DB/Redis에 저장
- 관리자 화면에 사용자/대화 검색 기능 추가
- 사용량 제한 또는 일일 호출 제한 추가

## 필수 환경변수

```text
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-5.4-mini
OPENAI_CHAT_REASONING_EFFORT=high
OPENAI_FEEDBACK_MODEL=gpt-5.4
OPENAI_FEEDBACK_REASONING_EFFORT=medium
APP_BASE_URL=https://서비스도메인
ADMIN_EMAILS=owner@example.com

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=

ENABLE_DEV_LOGIN=false
NODE_ENV=production
STORAGE_DIR=/var/data
SESSION_SECRET=충분히 긴 랜덤 문자열
DAILY_USER_START_LIMIT=30
DAILY_USER_CHAT_LIMIT=300
DAILY_USER_FEEDBACK_LIMIT=20
DAILY_USER_APP_FEEDBACK_LIMIT=10
MONTHLY_GLOBAL_BUDGET_KRW=0
MAX_JSON_BODY_BYTES=262144
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MUTATIONS_PER_WINDOW=80
```

## OAuth Callback URL

서비스 도메인이 `https://example.com`이라면 아래 URL을 각 플랫폼에 등록한다.

```text
Google: https://example.com/auth/google/callback
Kakao:  https://example.com/auth/kakao/callback
```

로컬 개발용 URL은 다음과 같다.

```text
Google: http://localhost:4173/auth/google/callback
Kakao:  http://localhost:4173/auth/kakao/callback
```

## 배포 절차

1. 호스팅 서비스를 정한다.
2. GitHub 저장소를 연결한다.
3. Node.js 앱으로 배포한다.
4. 환경변수를 입력한다.
5. Supabase를 기본 저장소로 사용한다. JSON fallback을 운영 백업으로 쓸 경우에만 persistent disk를 `/var/data` 같은 고정 경로에 연결하고 `STORAGE_DIR`을 맞춘다.
6. 배포 URL을 확인한다.
7. `APP_BASE_URL`을 실제 배포 URL로 바꾼다.
8. Google/Kakao OAuth callback URL을 등록한다.
9. Supabase 사용 시 `docs/launch-readiness-migration.sql`을 먼저 적용한다.
10. 로그인, 프로필 저장, 대화 시작, 피드백 저장, 기록 조회를 테스트한다.
11. 로컬에서는 `npm run qa:launch`로 계정 삭제, 데이터 내보내기, CSRF, PWA 정적 파일을 확인한다.
12. 운영 Render에서는 `SMOKE_URL=https://서비스도메인 npm run smoke`와 `QA_BASE_URL=https://서비스도메인 npm run qa:launch`로 공개 정적/헬스 체크를 확인한다. 운영은 `ENABLE_DEV_LOGIN=false`이므로 인증 이후 흐름은 Google/Kakao 테스트 계정으로 수동 확인한다.
13. 도메인을 연결한다.

## 내가 할 수 있는 작업

- 배포용 코드 구조 정리
- Dockerfile 작성
- 환경변수 문서화
- DB 전환 구현
- 관리자 기능 확장
- 배포 실패 로그 분석
- OAuth callback 오류 디버깅

## 사용자가 해야 하는 작업

- 호스팅/도메인/OAuth/OpenAI 계정의 소유자 인증
- 결제 수단 등록
- API Key와 OAuth Secret 발급
- 운영 정책 결정

## 현재 상태에서 바로 배포할 때의 판단

지인 몇 명에게 테스트 링크를 공유하는 정도라면 현재 구조로도 가능하다.
공개 서비스처럼 열어둘 계획이면 DB 전환과 사용량 제한을 먼저 넣는 편이 맞다.
