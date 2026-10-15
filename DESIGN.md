# 복음 대화 훈련소 Design System

## 1. Atmosphere & Identity

처음 전도를 연습하는 성도와 청년을 위한 조용한 연습 공간. 기존의 따뜻한 종이색과 청록색, 인물 사진을 유지한다. 사진이 화면 전체를 차지하기보다 실제로 할 일과 함께 보이게 한다. 첫 화면의 핵심은 '말을 잘해야 한다'는 부담을 낮추고 하나의 추천 훈련으로 안내하는 것이다. 연습 상대는 AI이며 실제 사람의 신앙 반응을 예측하지 않는다는 점을 명확히 한다.

## 2. Color

기존 `src/index.css`의 OKLCH 변수를 사용한다. 이 작업은 기존 라이트 테마를 유지하며 OS 다크 설정에서도 동일한 가독성을 검증한다.

| 역할 | 토큰 | 현재 값 |
|---|---|---|
| 종이 배경 | `--background` | `oklch(0.985 0.012 91.49)` |
| 본문 | `--foreground` | `oklch(0.21 0.016 175.44)` |
| 표면 | `--card` | `oklch(0.998 0.008 91.49)` |
| 주 행동 | `--primary` | `oklch(0.48 0.105 180.58)` |
| 주 행동 글자 | `--primary-foreground` | `oklch(0.985 0.012 91.49)` |
| 선택 배경 | `--secondary` | `oklch(0.94 0.04 179.88)` |
| 선택 글자 | `--secondary-foreground` | `oklch(0.35 0.08 180.58)` |
| 보조 배경/글자 | `--muted` / `--muted-foreground` | 기존 CSS 값 유지 |
| 경계/오류/포커스 | `--border` / `--destructive` / `--ring` | 기존 CSS 값 유지 |

사용자 말풍선은 기존 노란색 대신 secondary 색상을 쓴다. 선택은 배경과 체크 표시로 구분한다.

## 3. Typography

- 기존 시스템 글꼴: Pretendard, Noto Sans KR, system-ui; 추가 웹폰트 다운로드 없음.
- 화면 제목 20px/700, 홈 제목 32px/700, 본문 16px/1.65, 보조 본문 14px/1.6, 짧은 메타 정보 12px.
- 한글 제목은 `word-break: keep-all`, `text-wrap: balance`; 본문은 긴 문자열에 `overflow-wrap: anywhere`.
- 긴 설명을 작은 회색 글씨로 밀어 넣지 않고 접거나 단계별로 제공한다.

## 4. Spacing & Layout

- 4px 기반 Tailwind spacing: 2/3/4/5/6/8 = 8/12/16/20/24/32px.
- 모바일 중심 480px 앱 셸을 유지한다. 데스크톱은 중앙에 배치한다.
- 앱 셸은 visualViewport 높이, 본문만 세로 스크롤, 하단 버튼·입력창은 고정 영역.
- 홈도 스크롤을 허용한다. 사진, 설명, 추천 훈련, 직접 선택 순으로 배치한다.
- 사진은 고정 aspect ratio, 인물 목록은 동일한 크기의 선택 행, 긴 문구는 줄바꿈한다.

## 5. Components

- Button: 기존 `components/ui/button`; primary/secondary/outline/ghost. 주요 행동 44px 이상, focus-visible 유지, busy/disabled 구분, 로딩 문구를 같은 버튼에 표시.
- Card: 기존 Card 계열. 내용 구획에만 사용하며 중첩 카드 금지. 내부 padding 16–24px, 제목과 본문 간 8px.
- Persona choice: 기존 Avatar + 텍스트 + 체크. `aria-pressed`, 키보드 포커스, 선택 배경, 설명 줄바꿈.
- Training guide: 목표·작은 연습 과제·막혔을 때 참고 질문. home/context/review/chat에서 같은 데이터 사용. 도움말은 사용자가 펼칠 때만 표시하며 AI 호출 없음.
- Alert: 기존 Alert. 실패 원인과 사용자가 취할 행동을 같은 위치에 제공. 전역 초기화 오류도 홈에 노출.
- Form: 기존 Label/Input/Select. 이름만 필수, 나머지는 선택 영역. 빈 이름 오류를 명시하고 저장 중 중복 제출 방지.
- Feedback: 다음 대화에서 해볼 과제 하나를 먼저 배치하고 전체 평가는 펼쳐 읽기. 과제 추출이 안 되면 원문 전체 표시. 생성 중/실패/완료 상태 유지.
- PWA install: 훈련을 한 번 마치고 피드백 화면을 떠난 뒤 제안. 첫 방문, 대화, 피드백 읽기를 가리지 않음.

## 6. Motion & Interaction

기존 버튼 색 전환과 Radix Drawer 동작을 유지한다. 새 장식 애니메이션은 추가하지 않는다. reduced-motion에서 불필요한 pulse/transition을 줄인다. 입력·저장·전송은 즉시 busy 상태로 전환한다. 도움말은 native details로 키보드 조작 가능하게 한다.

## 7. Depth & Surface

기존 card/background의 미세한 색 차이와 얕은 그림자를 유지한다. radius 기준은 기존 `--radius: 0.85rem`, 입력·버튼은 파생 md, 인물 사진과 주요 블록은 xl/2xl. 화면 전체를 어둡게 만드는 사진 오버레이를 홈의 주 표현으로 사용하지 않는다.

## 8. Accessibility Constraints & Accepted Debt

목표: WCAG AA 대비, visible focus, 키보드 조작, 한글 줄바꿈, 390px 폭에서 가로 스크롤 없음. 주 입력창은 명시적 접근성 이름, 선택 행은 선택 상태를 노출한다. 실제 검증 결과와 미해결 사항은 출시 QA 기록에 별도로 남긴다. 미검증을 통과로 표시하지 않는다.

현재 확인할 항목: 고정 폭 셸의 데스크톱 활용도, 기존 admin 화면 밀도, 화면 리더 전체 순회. 이 목록은 출시 승인이나 사용자의 부채 수용을 뜻하지 않는다.
