# Gospel Conversation Simulator

복음 전도 대화를 AI 페르소나와 미리 연습하고 피드백을 받는 모바일 웹 MVP입니다.

## 실행

```powershell
npm install
npm start
```

기본 주소는 `http://localhost:4173`입니다.

## 필수 환경변수

로컬에서는 `.env.example`을 참고해 `.env`를 만들 수 있습니다. `.env`는 Git에 올리지 않습니다.

운영 배포에는 최소한 아래 값이 필요합니다.

```text
NODE_ENV=production
ENABLE_DEV_LOGIN=false
APP_BASE_URL=https://your-service.onrender.com
OPENAI_API_KEY=...
OPENAI_CHAT_MODEL=gpt-5.4-mini
OPENAI_FEEDBACK_MODEL=gpt-5.4
```

Google/Kakao 로그인을 운영에서 쓰려면 OAuth 앱을 만들고 callback URL을 등록해야 합니다.

```text
https://your-service.onrender.com/auth/google/callback
https://your-service.onrender.com/auth/kakao/callback
```

## Render 배포

이 저장소는 Render Blueprint용 `render.yaml`을 포함합니다.

1. GitHub 저장소에 이 프로젝트를 push합니다.
2. Render Dashboard에서 `Blueprint`를 선택합니다.
3. GitHub 저장소를 연결하고 `render.yaml`을 사용합니다.
4. `OPENAI_API_KEY`, `APP_BASE_URL`, OAuth 관련 secret을 Render 환경변수에 입력합니다.
5. 배포 후 `/healthz`가 `{"ok":true}`를 반환하는지 확인합니다.

현재 Blueprint는 무료 배포용입니다. 저장 방식은 `storage/db.json` 기반이라 Render 무료 인스턴스에서는 재시작/재배포 시 로그인, 프로필, 대화 기록이 사라질 수 있습니다.

기록을 안정적으로 보존하려면 둘 중 하나가 필요합니다.

- Render 유료 web service + persistent disk
- Supabase/Postgres 같은 외부 DB
