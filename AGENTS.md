# AGENTS.md

## Overview

Gospel Conversation Simulator — 복음 전도 대화를 AI 페르소나와 연습하고 피드백을 받는 모바일 웹 MVP.
단일 파일 Node.js 서버(`server.js`)로 npm 의존성이 전혀 없고, `public/` 디렉토리에서 정적 프론트엔드를 서빙합니다.

## Cursor Cloud specific instructions

### 서비스 실행

- `node server.js` 로 서버를 시작합니다 (포트 4173, 개발 모드 기본).
- 헬스체크: `curl http://localhost:4173/healthz` → `{"ok":true}`
- `.env` 파일이 없으면 `.env.example`을 복사해서 사용합니다. `NODE_ENV`를 설정하지 않으면 자동으로 개발 모드(dev login 활성화)입니다.

### 인증 (개발용)

- 개발 모드에서는 `ENABLE_DEV_LOGIN`이 자동으로 `true`가 되어 OAuth 없이 로그인할 수 있습니다.
- API 호출: `POST /api/dev-login` with `{"email":"dev@example.local","displayName":"개발자"}`
- 프로필 완성이 필요한 엔드포인트(`/api/conversations` 등)는 `/api/profile` POST로 프로필을 먼저 입력해야 합니다.

### AI 기능

- AI 채팅/피드백 기능은 `OPENAI_API_KEY` 환경변수가 필요합니다. 키 없이도 서버 자체는 정상 실행되고 UI 탐색이 가능합니다.
- Anthropic을 대안 AI 제공자로 사용하려면 `ANTHROPIC_API_KEY`를 설정합니다.

### 린트/테스트/빌드

- 이 프로젝트에는 린터, 테스트 프레임워크, 빌드 단계가 설정되어 있지 않습니다.
- `package.json`에 `start` 스크립트만 존재합니다: `node server.js`
- 프론트엔드는 빌드 없는 바닐라 JS/CSS이므로 서버를 실행하면 바로 확인 가능합니다.

### UI 주의사항

- 리뷰/브리핑 페이지("프로필 확인")에서 "확인하고 시작" 버튼은 스크롤 게이트가 적용되어 있습니다. 콘텐츠를 끝까지 스크롤해야 버튼이 활성화됩니다.
- AI 응답 생성에 5~15초 소요됩니다. 대화 시작(`/api/start`) 및 채팅(`/api/chat`) 호출 시 타임아웃에 주의합니다.

### 데이터 저장

- 기본 저장소는 `storage/db.json` (파일 기반)입니다. 서버 재시작 시에도 유지되지만, 테스트 초기화가 필요하면 이 파일을 삭제하면 됩니다.
- Supabase 모드를 사용하려면 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 설정합니다.
