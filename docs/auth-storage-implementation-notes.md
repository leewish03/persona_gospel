# 로그인/저장/운영 구조 구현 메모

## 현재 구현

- 사용자는 더 이상 OpenAI API Key를 입력하지 않는다.
- 서버가 `OPENAI_API_KEY` 환경변수로 OpenAI Responses API를 호출한다.
- Google/Kakao OAuth 진입점이 있다.
- 실제 OAuth 사용에는 각 플랫폼 앱 등록값이 필요하다.
- 로컬 개발에서는 개발용 로그인을 사용할 수 있다.
- 로그인 후 이름, 나이, 성별, 소속 교회, 사용 용도를 입력해야 훈련을 시작할 수 있다.
- 대화와 피드백은 서버의 `storage/db.json`에 저장된다.
- `storage/db.json`은 개인정보/대화 기록이므로 Git에 커밋하지 않는다.

## 필요한 환경변수

```text
OPENAI_API_KEY=서버 소유 OpenAI API Key
OPENAI_CHAT_MODEL=gpt-5.4-mini
OPENAI_FEEDBACK_MODEL=gpt-5.4
APP_BASE_URL=http://localhost:4173
ADMIN_EMAILS=관리자 이메일 목록

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
```

## 운영 전 결정 필요

- 실제 서비스 도메인
- Google OAuth 앱 등록 정보
- Kakao OAuth 앱 등록 정보
- 관리자 이메일
- 후원 계좌 또는 후원 링크 문구
- 파일 저장소 유지 여부 또는 SQLite/Postgres 전환 여부
