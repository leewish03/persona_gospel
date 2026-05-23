export const flowScreens = ["home", "persona", "context", "review", "chat", "feedback"];
export const setupScreens = ["persona", "context", "review"];

export const relationshipText = {
  first_meeting: "처음 만난 사람",
  acquaintance: "안면만 있는 사람",
  casual_friend: "편한 지인",
  old_friend: "오래된 친구",
  prior_faith_talk: "이미 신앙 이야기를 해본 사람"
};

export const settingText = {
  cafe_catchup: "카페에서 대화를 나누는 중",
  meal_after_group: "식사/모임 후 둘만 남아 이야기하는 중",
  walk_after_work: "퇴근길에 함께 걸어가는 중",
  late_night_dm: "밤에 카톡/DM으로 진지한 이야기가 이어지는 중",
  campus_or_office_break: "학교/직장 쉬는 시간에 잠깐 마주 앉은 중",
  concern_shared: "페르소나가 고민을 털어놓은 직후",
  faith_topic_arose: "신앙/교회 이야기가 자연스럽게 언급된 직후"
};

export const goalText = {
  listen_and_understand: "상대의 말 듣고 이해하기",
  ask_better_questions: "좋은 질문으로 대화 열기",
  connect_to_faith: "삶의 고민에서 신앙 이야기로 연결하기",
  explain_gospel_core: "복음의 핵심을 분명하게 설명하기",
  respond_to_barrier: "상대의 오해/장벽에 차분히 답하기",
  share_personal_witness: "내 말투로 짧게 간증/증거하기"
};

export const personaImages = {
  "kim-sihyun": "/assets/persona-kim-sihyun.jpg",
  "park-doyoon": "/assets/persona-park-doyoon.jpg",
  "jung-haeun": "/assets/persona-jung-haeun.jpg",
  "choi-minjae": "/assets/persona-choi-minjae.jpg",
  "oh-yujin": "/assets/persona-oh-yujin.jpg",
  "han-seojun": "/assets/persona-han-seojun.jpg"
};

export const settingImages = {
  cafe_catchup: "/assets/situation-career.jpg",
  meal_after_group: "/assets/situation-after-group.jpg",
  walk_after_work: "/assets/situation-walk.jpg",
  late_night_dm: "/assets/situation-late-dm.jpg",
  campus_or_office_break: "/assets/situation-first-meeting.jpg",
  concern_shared: "/assets/situation-hardship.jpg",
  faith_topic_arose: "/assets/situation-faith.jpg"
};

export const screenMeta = {
  home: { eyebrow: "SOLOMON LAB", title: "복음 대화 훈련소", action: "훈련 시작" },
  login: { eyebrow: "Account", title: "로그인" },
  profile: { eyebrow: "Profile", title: "기본 정보 입력", action: "저장하고 시작" },
  persona: { eyebrow: "1 / 3", title: "페르소나 선택", action: "다음", secondary: "랜덤 선택" },
  context: { eyebrow: "2 / 3", title: "상황 설정", action: "다음", secondary: "랜덤 선택" },
  review: { eyebrow: "3 / 3", title: "프로필 확인", action: "확인하고 시작" },
  chat: { eyebrow: "Training", title: "대화 연습", action: "종료하고 피드백" },
  feedback: { eyebrow: "Report", title: "피드백", action: "공유하기", secondary: "같은 설정으로 다시" },
  history: { eyebrow: "History", title: "훈련 기록" },
  historyDetail: { eyebrow: "History", title: "기록 상세" },
  settings: { eyebrow: "Settings", title: "설정" },
  admin: { eyebrow: "Admin", title: "관리자" }
};

export const profileDefaults = {
  name: "",
  age: "",
  gender: "",
  church: "",
  useCase: ""
};
