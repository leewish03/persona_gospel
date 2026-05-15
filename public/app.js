const flowScreens = ["home", "persona", "context", "review", "chat", "feedback"];
const setupScreens = ["persona", "context", "review"];

const state = {
  personas: [],
  selectedPersonaId: null,
  currentScreen: "home",
  auth: { user: null, devLoginEnabled: false, googleEnabled: false, kakaoEnabled: false },
  activeSession: null,
  conversationId: "",
  messages: [],
  latestFeedbackText: "",
  sessionStarted: false,
  isBusy: false,
  historyLoaded: false,
  reviewScrolled: false,
  keyboardOpen: false
};

const els = {
  backButton: document.querySelector("#backButton"),
  resetButton: document.querySelector("#resetButton"),
  screenEyebrow: document.querySelector("#screenEyebrow"),
  screenTitle: document.querySelector("#screenTitle"),
  progressBar: document.querySelector("#progressBar"),
  authError: document.querySelector("#authError"),
  devLoginButton: document.querySelector("#devLoginButton"),
  profileName: document.querySelector("#profileName"),
  profileAge: document.querySelector("#profileAge"),
  profileGenderButtons: document.querySelectorAll("[data-profile-gender]"),
  profileChurch: document.querySelector("#profileChurch"),
  profileUseCase: document.querySelector("#profileUseCase"),
  profileError: document.querySelector("#profileError"),
  contextError: document.querySelector("#contextError"),
  personaList: document.querySelector("#personaList"),
  relationship: document.querySelector("#relationship"),
  setting: document.querySelector("#setting"),
  goal: document.querySelector("#goal"),
  contextImage: document.querySelector("#contextImage"),
  reviewScreen: document.querySelector("#screen-review"),
  reviewSessionSummary: document.querySelector("#reviewSessionSummary"),
  reviewScrollHint: document.querySelector("#reviewScrollHint"),
  personaDetail: document.querySelector("#personaDetail"),
  chatMeta: document.querySelector("#chatMeta"),
  messageList: document.querySelector("#messageList"),
  feedbackPanel: document.querySelector("#feedbackPanel"),
  historyList: document.querySelector("#historyList"),
  accountPanel: document.querySelector("#accountPanel"),
  adminPanel: document.querySelector("#adminPanel"),
  logoutButton: document.querySelector("#logoutButton"),
  chatForm: document.querySelector("#chatForm"),
  messageInput: document.querySelector("#messageInput"),
  sendMessage: document.querySelector("#sendMessage"),
  bottomBar: document.querySelector("#bottomBar"),
  primaryAction: document.querySelector("#primaryAction"),
  secondaryAction: document.querySelector("#secondaryAction"),
  tabBar: document.querySelector("#tabBar"),
  messageTemplate: document.querySelector("#messageTemplate")
};

const relationshipText = {
  first_meeting: "처음 만난 사람",
  acquaintance: "안면만 있는 사람",
  casual_friend: "편한 지인",
  old_friend: "오래된 친구",
  prior_faith_talk: "이미 신앙 이야기를 해본 사람"
};

const settingText = {
  cafe_catchup: "카페에서 오랜만에 근황을 나누는 중",
  meal_after_group: "식사/모임 후 둘만 남아 이야기하는 중",
  walk_after_work: "퇴근길에 함께 걸어가는 중",
  late_night_dm: "밤에 카톡/DM으로 진지한 이야기가 이어지는 중",
  campus_or_office_break: "학교/직장 쉬는 시간에 잠깐 마주 앉은 중",
  concern_shared: "상대가 먼저 고민을 털어놓은 직후",
  faith_topic_arose: "신앙/교회 이야기가 자연스럽게 언급된 직후"
};

const goalText = {
  listen_and_understand: "상대의 말 듣고 이해하기",
  ask_better_questions: "좋은 질문으로 대화 열기",
  connect_to_faith: "삶의 고민에서 신앙 이야기로 연결하기",
  explain_gospel_core: "복음의 핵심을 분명하게 설명하기",
  respond_to_barrier: "상대의 오해/장벽에 차분히 답하기",
  share_personal_witness: "내 말투로 짧게 간증/증거하기"
};

const screenMeta = {
  home: { eyebrow: "Witness Lab", title: "복음 대화 훈련소", action: "훈련 시작" },
  login: { eyebrow: "Account", title: "로그인" },
  profile: { eyebrow: "Profile", title: "기본 정보 입력", action: "저장하고 시작" },
  persona: { eyebrow: "1 / 3", title: "페르소나 선택", action: "다음", secondary: "랜덤 선택" },
  context: { eyebrow: "2 / 3", title: "상황 설정", action: "다음", secondary: "랜덤 선택" },
  review: { eyebrow: "3 / 3", title: "프로필 확인", action: "확인하고 시작" },
  chat: { eyebrow: "Training", title: "대화 연습", action: "종료하고 피드백" },
  feedback: { eyebrow: "Report", title: "피드백", action: "공유하기", secondary: "같은 설정으로 다시" },
  history: { eyebrow: "History", title: "훈련 기록" },
  settings: { eyebrow: "Settings", title: "설정" },
  admin: { eyebrow: "Admin", title: "관리자" }
};

const personaImages = {
  "kim-sihyun": "/assets/persona-kim-sihyun.jpg",
  "park-doyoon": "/assets/persona-park-doyoon.jpg",
  "jung-haeun": "/assets/persona-jung-haeun.jpg",
  "choi-minjae": "/assets/persona-choi-minjae.jpg",
  "oh-yujin": "/assets/persona-oh-yujin.jpg",
  "han-seojun": "/assets/persona-han-seojun.jpg"
};

const settingImages = {
  cafe_catchup: "/assets/situation-career.jpg",
  meal_after_group: "/assets/situation-after-group.jpg",
  walk_after_work: "/assets/situation-walk.jpg",
  late_night_dm: "/assets/situation-late-dm.jpg",
  campus_or_office_break: "/assets/situation-first-meeting.jpg",
  concern_shared: "/assets/situation-hardship.jpg",
  faith_topic_arose: "/assets/situation-faith.jpg"
};

function hasUser() {
  return Boolean(state.auth.user);
}

function profileComplete() {
  return Boolean(state.auth.user?.profileComplete);
}

function isAdmin() {
  return state.auth.user?.role === "admin";
}

function currentPersona() {
  return state.personas.find((persona) => persona.id === state.selectedPersonaId) || state.personas[0];
}

function currentSession() {
  return (
    state.activeSession || {
      personaId: state.selectedPersonaId,
      relationship: els.relationship.value,
      setting: els.setting.value,
      goal: els.goal.value
    }
  );
}

async function getJson(path) {
  const response = await fetch(path);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
  return data;
}

async function postJson(path, payload = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
  return data;
}

function goTo(screen) {
  if (screen === "persona" || screen === "context" || screen === "review" || screen === "chat") {
    if (!ensureReadyForTraining()) return;
  }
  if (screen === "review") {
    state.reviewScrolled = false;
    requestAnimationFrame(() => {
      els.reviewScreen.scrollTop = 0;
      updateReviewGate();
    });
  }
  state.currentScreen = screen;
  if (screen !== "context") els.contextError.textContent = "";
  if (screen !== "profile") els.profileError.textContent = "";
  if (screen === "history") void loadHistory();
  if (screen === "settings") renderSettings();
  if (screen === "admin") void loadAdmin();
  render();
}

function updateViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  const keyboardOpen = Boolean(window.visualViewport && window.innerHeight - window.visualViewport.height > 140);
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  if (state.keyboardOpen !== keyboardOpen) {
    state.keyboardOpen = keyboardOpen;
    renderChrome();
  }
  if (state.currentScreen === "chat") requestAnimationFrame(scrollMessagesToBottom);
}

function ensureReadyForTraining() {
  if (!hasUser()) {
    state.currentScreen = "login";
    return false;
  }
  if (!profileComplete()) {
    fillProfileForm();
    state.currentScreen = "profile";
    return false;
  }
  return true;
}

function previousScreen() {
  if (state.currentScreen === "chat" && state.sessionStarted) return;
  if (state.currentScreen === "home") return;
  if (state.currentScreen === "history" || state.currentScreen === "settings" || state.currentScreen === "admin") {
    goTo("home");
    return;
  }
  const index = flowScreens.indexOf(state.currentScreen);
  if (index > 0) goTo(flowScreens[index - 1]);
  else goTo("home");
}

function setBusy(isBusy, label = "") {
  state.isBusy = isBusy;
  els.primaryAction.disabled =
    isBusy ||
    (state.currentScreen === "feedback" && !state.latestFeedbackText) ||
    (state.currentScreen === "review" && !state.reviewScrolled);
  els.secondaryAction.disabled = isBusy;
  els.backButton.disabled = isBusy || (state.currentScreen === "chat" && state.sessionStarted);
  els.resetButton.disabled = isBusy;
  els.messageInput.disabled = isBusy || !state.sessionStarted;
  els.sendMessage.disabled = isBusy || !state.sessionStarted;
  for (const el of [els.relationship, els.setting, els.goal]) {
    el.disabled = isBusy || state.sessionStarted;
  }
  els.primaryAction.classList.toggle("busy", isBusy && label === "primary");
  els.sendMessage.classList.toggle("busy", isBusy && label === "chat");
}

function renderScreens() {
  for (const screen of document.querySelectorAll(".screen")) {
    screen.classList.toggle("is-active", screen.dataset.screen === state.currentScreen);
  }
}

function renderChrome() {
  const meta = screenMeta[state.currentScreen] || screenMeta.home;
  const flowIndex = Math.max(0, flowScreens.indexOf(state.currentScreen));
  const setupIndex = setupScreens.indexOf(state.currentScreen);
  els.screenEyebrow.textContent = meta.eyebrow;
  els.screenTitle.textContent = meta.title;
  const progress =
    setupIndex >= 0 ? ((setupIndex + 1) / setupScreens.length) * 100 : ((flowIndex + 1) / flowScreens.length) * 100;
  els.progressBar.style.width = `${progress}%`;

  els.backButton.hidden = false;
  els.resetButton.hidden = false;
  els.backButton.style.visibility = state.currentScreen === "home" ? "hidden" : "visible";
  els.resetButton.style.visibility = state.currentScreen === "home" ? "hidden" : "visible";

  els.chatForm.hidden = state.currentScreen !== "chat";
  const actionless = ["login", "history", "settings", "admin"].includes(state.currentScreen);
  els.bottomBar.hidden = actionless || (state.currentScreen === "chat" && state.sessionStarted && state.messages.length < 2);
  els.primaryAction.textContent = meta.action || "";
  els.secondaryAction.textContent = meta.secondary || "";
  els.secondaryAction.hidden = !meta.secondary;
  els.bottomBar.classList.toggle("has-secondary", Boolean(meta.secondary));
  els.primaryAction.disabled =
    (state.currentScreen === "feedback" && !state.latestFeedbackText) ||
    (state.currentScreen === "review" && !state.reviewScrolled);

  const showTabs =
    hasUser() &&
    profileComplete() &&
    !["login", "profile"].includes(state.currentScreen) &&
    !(state.currentScreen === "chat" && state.keyboardOpen);
  els.tabBar.hidden = !showTabs;
  for (const button of els.tabBar.querySelectorAll("button")) {
    const tab = button.dataset.tab;
    button.hidden = tab === "admin" && !isAdmin();
    button.classList.toggle("is-active", tab === state.currentScreen || (tab === "home" && flowScreens.includes(state.currentScreen)));
  }
}

function renderPersonas() {
  els.personaList.innerHTML = "";
  for (const persona of state.personas) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `persona-option ${persona.id === state.selectedPersonaId ? "is-selected" : ""}`;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(persona.id === state.selectedPersonaId));
    button.innerHTML = `
      <img class="avatar" src="${personaImages[persona.id]}" alt="" aria-hidden="true" />
      <span>
        <strong>${persona.name}</strong>
        <span>${persona.title}</span>
      </span>
    `;
    button.addEventListener("click", () => {
      if (state.sessionStarted || state.isBusy) return;
      state.selectedPersonaId = persona.id;
      render();
    });
    els.personaList.append(button);
  }
}

function renderPersonaDetail() {
  const persona = currentPersona();
  if (!persona) return;
  els.personaDetail.innerHTML = `
    <img src="${personaImages[persona.id]}" alt="${persona.name} 프로필 이미지" />
    <h3>${persona.name}</h3>
    <p>${persona.shortDescription}</p>
    <dl>
      <dt>내면 갈등</dt>
      <dd>${persona.innerConflicts.slice(0, 3).join("<br>")}</dd>
      <dt>복음 장벽</dt>
      <dd class="tag-row">${persona.gospelBarriers.map((item) => `<span class="tag">${item}</span>`).join("")}</dd>
      <dt>대표 문장</dt>
      <dd>"${persona.sampleLines[0]}"</dd>
    </dl>
  `;
}

function renderReviewSummary() {
  const persona = currentPersona();
  const session = currentSession();
  if (!persona) return;
  els.reviewSessionSummary.innerHTML = `
    <span>선택한 훈련</span>
    <strong>${persona.name}</strong>
    <dl>
      <dt>관계</dt><dd>${relationshipText[session.relationship] || "선택 안 됨"}</dd>
      <dt>상황</dt><dd>${settingText[session.setting] || "선택 안 됨"}</dd>
      <dt>훈련 초점</dt><dd>${goalText[session.goal] || "선택 안 됨"}</dd>
    </dl>
  `;
}

function renderChatMeta() {
  const persona = currentPersona();
  if (!persona) return;
  const session = currentSession();
  els.chatMeta.textContent = [persona.name, relationshipText[session.relationship], settingText[session.setting]]
    .filter(Boolean)
    .join(" · ");
}

function renderContextImage() {
  const image = settingImages[els.setting.value];
  if (!image) {
    els.contextImage.hidden = true;
    els.contextImage.removeAttribute("src");
    return;
  }
  els.contextImage.src = image;
  els.contextImage.hidden = false;
}

function renderMessages() {
  els.messageList.innerHTML = "";
  els.messageList.append(els.chatMeta);
  const persona = currentPersona();
  for (const message of state.messages) {
    const node = els.messageTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(message.role);
    const avatar = node.querySelector(".message-avatar");
    const role = node.querySelector(".message-role");
    const body = node.querySelector(".message-body");

    if (message.role === "assistant") {
      avatar.src = personaImages[persona.id];
      avatar.alt = `${persona.name} 프로필 이미지`;
      avatar.removeAttribute("aria-hidden");
      role.textContent = persona.name;
    } else {
      avatar.remove();
      role.textContent = message.role === "user" ? "나" : "시스템";
    }

    body.textContent = message.content;
    els.messageList.append(node);
  }
  scrollMessagesToBottom();
}

function scrollMessagesToBottom() {
  els.messageList.scrollTop = els.messageList.scrollHeight;
}

function renderSettings() {
  const user = state.auth.user;
  if (!user) return;
  const profile = user.profile || {};
  els.accountPanel.innerHTML = `
    <h3>내 정보</h3>
    <dl class="profile-list">
      <dt>이메일</dt><dd>${user.email || "없음"}</dd>
      <dt>이름</dt><dd>${profile.name || user.displayName || "미입력"}</dd>
      <dt>나이</dt><dd>${profile.age || "미입력"}</dd>
      <dt>성별</dt><dd>${profile.gender || "미입력"}</dd>
      <dt>소속 교회</dt><dd>${profile.church || "미입력"}</dd>
      <dt>사용 용도</dt><dd>${profile.useCase || "미입력"}</dd>
    </dl>
    <button class="secondary-button full-width" id="editProfileButton" type="button">프로필 수정</button>
  `;
  document.querySelector("#editProfileButton").addEventListener("click", () => {
    fillProfileForm();
    goTo("profile");
  });
}

function render() {
  renderScreens();
  renderChrome();
  renderPersonas();
  renderPersonaDetail();
  renderReviewSummary();
  renderContextImage();
  renderChatMeta();
  renderMessages();
}

function updateReviewGate() {
  if (state.currentScreen !== "review") return;
  const remaining = els.reviewScreen.scrollHeight - els.reviewScreen.scrollTop - els.reviewScreen.clientHeight;
  const needsScroll = els.reviewScreen.scrollHeight > els.reviewScreen.clientHeight + 8;
  const done = !needsScroll || remaining <= 8;
  state.reviewScrolled = done;
  els.primaryAction.disabled = !done || state.isBusy;
  els.reviewScrollHint.textContent = done ? "확인할 준비가 되었습니다." : "프로필을 끝까지 읽으면 확인 버튼이 활성화됩니다.";
  els.reviewScrollHint.classList.toggle("is-done", done);
}

function fillProfileForm() {
  const profile = state.auth.user?.profile || {};
  els.profileName.value = profile.name || state.auth.user?.displayName || "";
  els.profileAge.value = profile.age || "";
  setProfileGender(profile.gender || "");
  els.profileChurch.value = profile.church || "";
  els.profileUseCase.value = profile.useCase || "";
}

function selectedProfileGender() {
  return [...els.profileGenderButtons].find((button) => button.getAttribute("aria-pressed") === "true")?.dataset
    .profileGender || "";
}

function setProfileGender(gender) {
  for (const button of els.profileGenderButtons) {
    const selected = button.dataset.profileGender === gender;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function validateContext() {
  if (els.relationship.value && els.setting.value && els.goal.value) return true;
  els.contextError.textContent = "관계, 상황, 훈련 초점을 모두 선택해주세요.";
  return false;
}

function validateProfile() {
  const values = [els.profileName.value, els.profileAge.value, selectedProfileGender(), els.profileChurch.value, els.profileUseCase.value];
  if (values.every((value) => value.trim())) return true;
  els.profileError.textContent = "이름, 나이, 성별, 소속 교회, 사용 용도를 모두 입력해주세요.";
  return false;
}

async function saveProfile() {
  if (!validateProfile()) return;
  setBusy(true, "primary");
  try {
    const data = await postJson("/api/profile", {
      profile: {
        name: els.profileName.value,
        age: els.profileAge.value,
        gender: selectedProfileGender(),
        church: els.profileChurch.value,
        useCase: els.profileUseCase.value
      }
    });
    state.auth.user = data.user;
    goTo("home");
  } catch (error) {
    els.profileError.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function devLogin() {
  els.authError.textContent = "";
  try {
    const data = await postJson("/api/dev-login", {
      email: "dev@example.local",
      displayName: "개발용 사용자"
    });
    state.auth.user = data.user;
    fillProfileForm();
    goTo(profileComplete() ? "home" : "profile");
  } catch (error) {
    els.authError.textContent = error.message;
  }
}

function addSystemMessage(content) {
  state.messages.push({ role: "system", content });
  renderMessages();
}

async function startSession() {
  if (!validateContext()) return;
  state.latestFeedbackText = "";
  state.activeSession = {
    personaId: state.selectedPersonaId,
    relationship: els.relationship.value,
    setting: els.setting.value,
    goal: els.goal.value
  };
  state.sessionStarted = true;
  state.messages = [];
  state.conversationId = "";
  els.feedbackPanel.innerHTML = "";
  goTo("chat");
  setBusy(true, "primary");

  try {
    const data = await postJson("/api/start", { session: currentSession() });
    state.conversationId = data.conversationId || "";
    state.messages.push({ role: "assistant", content: data.text });
    state.historyLoaded = false;
    render();
    els.messageInput.focus();
  } catch (error) {
    state.sessionStarted = false;
    state.activeSession = null;
    state.messages = [];
    goTo("context");
    els.contextError.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function sendMessage(event) {
  event.preventDefault();
  await submitMessage();
}

async function submitMessage() {
  const content = els.messageInput.value.trim();
  if (!content || state.isBusy || !state.sessionStarted) return;

  state.messages.push({ role: "user", content });
  els.messageInput.value = "";
  renderMessages();
  setBusy(true, "chat");

  try {
    const data = await postJson("/api/chat", {
      conversationId: state.conversationId,
      session: currentSession(),
      messages: state.messages.filter((message) => message.role !== "system")
    });
    state.messages.push({ role: "assistant", content: data.text });
    state.historyLoaded = false;
    render();
  } catch (error) {
    addSystemMessage(error.message);
  } finally {
    setBusy(false);
    els.messageInput.focus();
  }
}

function markdownToHtml(markdown) {
  return markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>")
    .replace(/<p><h2>/g, "<h2>")
    .replace(/<\/h2><\/p>/g, "</h2>")
    .replace(/<p><ul>/g, "<ul>")
    .replace(/<\/ul><\/p>/g, "</ul>");
}

async function finishSession() {
  state.latestFeedbackText = "";
  setBusy(true, "primary");
  goTo("feedback");
  els.feedbackPanel.innerHTML = `
    <img class="feedback-visual" src="/assets/feedback-report.jpg" alt="노트와 말풍선이 놓인 피드백 이미지" />
    <h3>피드백 리포트</h3>
    <p>대화 내용을 바탕으로 피드백을 생성하고 있습니다.</p>
  `;

  try {
    const data = await postJson("/api/feedback", {
      conversationId: state.conversationId,
      session: currentSession(),
      messages: state.messages.filter((message) => message.role !== "system")
    });
    state.latestFeedbackText = data.text;
    els.feedbackPanel.innerHTML = `
      <img class="feedback-visual" src="/assets/feedback-report.jpg" alt="노트와 말풍선이 놓인 피드백 이미지" />
      <h3>피드백 리포트</h3>
      ${markdownToHtml(data.text)}
    `;
    state.sessionStarted = false;
    state.historyLoaded = false;
    setBusy(false);
  } catch (error) {
    state.latestFeedbackText = "";
    els.feedbackPanel.innerHTML = `<h3>피드백 리포트</h3><p>${error.message}</p>`;
    state.sessionStarted = false;
    setBusy(false);
  }
}

async function loadHistory() {
  if (state.historyLoaded) return;
  els.historyList.innerHTML = `<p class="helper">기록을 불러오는 중입니다.</p>`;
  try {
    const data = await getJson("/api/conversations");
    state.historyLoaded = true;
    if (!data.conversations.length) {
      els.historyList.innerHTML = `<p class="helper">아직 저장된 훈련 기록이 없습니다.</p>`;
      return;
    }
    els.historyList.innerHTML = data.conversations
      .map((item) => {
        const persona = state.personas.find((entry) => entry.id === item.session?.personaId);
        const created = new Date(item.createdAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
        return `
          <article class="history-item">
            <strong>${persona?.name || "페르소나"} · ${item.status === "finished" ? "완료" : "진행 중"}</strong>
            <span>${created}</span>
            <p>${relationshipText[item.session?.relationship] || ""} · ${settingText[item.session?.setting] || ""}</p>
            ${item.feedbackText ? `<details><summary>피드백 보기</summary>${markdownToHtml(item.feedbackText)}</details>` : ""}
          </article>
        `;
      })
      .join("");
  } catch (error) {
    els.historyList.innerHTML = `<p class="form-error">${error.message}</p>`;
  }
}

async function loadAdmin() {
  if (!isAdmin()) {
    els.adminPanel.innerHTML = `<p class="form-error">관리자 권한이 필요합니다.</p>`;
    return;
  }
  els.adminPanel.innerHTML = `<p class="helper">관리자 데이터를 불러오는 중입니다.</p>`;
  try {
    const data = await getJson("/api/admin/summary");
    els.adminPanel.innerHTML = `
      <article><strong>${data.users}</strong><span>가입 사용자</span></article>
      <article><strong>${data.completedProfiles}</strong><span>프로필 완료</span></article>
      <article><strong>${data.conversations}</strong><span>전체 대화</span></article>
      <article><strong>${data.finishedConversations}</strong><span>피드백 완료</span></article>
    `;
  } catch (error) {
    els.adminPanel.innerHTML = `<p class="form-error">${error.message}</p>`;
  }
}

async function shareFeedback() {
  if (!state.latestFeedbackText) return;
  const persona = currentPersona();
  const session = currentSession();
  const shareText = [
    "복음 대화 훈련소 피드백 리포트",
    "",
    `페르소나: ${persona.name}`,
    `관계: ${relationshipText[session.relationship] || session.relationship}`,
    `상황: ${settingText[session.setting] || session.setting}`,
    `훈련 초점: ${goalText[session.goal] || session.goal}`,
    "",
    state.latestFeedbackText
  ].join("\n");

  try {
    if (navigator.share) {
      await navigator.share({ title: "복음 대화 훈련소 피드백 리포트", text: shareText });
      return;
    }
    await navigator.clipboard.writeText(shareText);
    showShareNotice("이 브라우저는 공유 시트를 지원하지 않아 리포트를 클립보드에 복사했습니다.");
  } catch (error) {
    if (error?.name === "AbortError") return;
    showShareNotice("공유를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function showShareNotice(message) {
  const existing = els.feedbackPanel.querySelector(".share-notice");
  if (existing) {
    existing.textContent = message;
    return;
  }
  const notice = document.createElement("p");
  notice.className = "share-notice";
  notice.textContent = message;
  els.feedbackPanel.prepend(notice);
}

function randomizePersona() {
  if (!state.personas.length || state.sessionStarted) return;
  const next = state.personas[Math.floor(Math.random() * state.personas.length)];
  state.selectedPersonaId = next.id;
  render();
}

function randomOptionValue(select) {
  const options = [...select.options].filter((option) => option.value && !option.disabled);
  return options[Math.floor(Math.random() * options.length)]?.value || "";
}

function randomizeContext() {
  if (state.sessionStarted) return;
  els.relationship.value = randomOptionValue(els.relationship);
  els.setting.value = randomOptionValue(els.setting);
  els.goal.value = randomOptionValue(els.goal);
  els.contextError.textContent = "";
  state.reviewScrolled = false;
  renderContextImage();
  renderReviewSummary();
  renderChatMeta();
}

function resetContextSelections() {
  els.relationship.value = "";
  els.setting.value = "";
  els.goal.value = "";
  els.contextError.textContent = "";
  state.reviewScrolled = false;
}

function resetAll() {
  state.activeSession = null;
  state.conversationId = "";
  state.messages = [];
  state.latestFeedbackText = "";
  state.sessionStarted = false;
  els.feedbackPanel.innerHTML = "";
  resetContextSelections();
  goTo("home");
}

async function handlePrimaryAction() {
  if (state.currentScreen === "home") {
    if (!hasUser()) {
      goTo("login");
      return;
    }
    if (!profileComplete()) {
      fillProfileForm();
      goTo("profile");
      return;
    }
    goTo("persona");
    return;
  }
  if (state.currentScreen === "profile") {
    await saveProfile();
    return;
  }
  if (state.currentScreen === "context") {
    if (validateContext()) goTo("review");
    return;
  }
  if (state.currentScreen === "review") {
    if (!state.reviewScrolled) {
      updateReviewGate();
      return;
    }
    await startSession();
    return;
  }
  if (state.currentScreen === "chat") {
    await finishSession();
    return;
  }
  if (state.currentScreen === "feedback") {
    await shareFeedback();
    return;
  }
  const index = flowScreens.indexOf(state.currentScreen);
  if (index >= 0 && index < flowScreens.length - 1) goTo(flowScreens[index + 1]);
}

async function handleSecondaryAction() {
  if (state.currentScreen === "persona") {
    randomizePersona();
    return;
  }
  if (state.currentScreen === "context") {
    randomizeContext();
    return;
  }
  if (state.currentScreen === "feedback") {
    state.messages = [];
    state.latestFeedbackText = "";
    state.sessionStarted = false;
    await startSession();
  }
}

async function logout() {
  await postJson("/api/logout");
  state.auth.user = null;
  state.historyLoaded = false;
  resetAll();
}

async function loadAuth() {
  const data = await getJson("/api/me");
  state.auth = {
    user: data.user,
    devLoginEnabled: data.auth?.devLoginEnabled,
    googleEnabled: data.auth?.googleEnabled,
    kakaoEnabled: data.auth?.kakaoEnabled
  };
  els.devLoginButton.hidden = !state.auth.devLoginEnabled;

  const params = new URLSearchParams(window.location.search);
  const authError = params.get("authError");
  if (authError) {
    els.authError.textContent = `로그인을 완료하지 못했습니다. (${authError})`;
    window.history.replaceState({}, "", window.location.pathname);
    state.currentScreen = "login";
  }

  if (state.auth.user && !state.auth.user.profileComplete) fillProfileForm();
}

async function init() {
  const [personaResponse] = await Promise.all([fetch("/data/personas.json"), loadAuth()]);
  state.personas = await personaResponse.json();
  state.selectedPersonaId = state.personas[0]?.id;
  if (state.currentScreen === "home" && state.auth.user && !state.auth.user.profileComplete) {
    fillProfileForm();
    state.currentScreen = "profile";
  }
  render();
}

els.backButton.addEventListener("click", previousScreen);
els.resetButton.addEventListener("click", resetAll);
els.primaryAction.addEventListener("click", handlePrimaryAction);
els.secondaryAction.addEventListener("click", handleSecondaryAction);
els.chatForm.addEventListener("submit", sendMessage);
els.messageInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void submitMessage();
});
els.messageInput.addEventListener("focus", () => {
  requestAnimationFrame(scrollMessagesToBottom);
});
els.devLoginButton.addEventListener("click", devLogin);
els.logoutButton.addEventListener("click", logout);
for (const button of els.profileGenderButtons) {
  button.addEventListener("click", () => {
    setProfileGender(button.dataset.profileGender);
    els.profileError.textContent = "";
  });
}
for (const el of [els.relationship, els.setting, els.goal]) {
  el.addEventListener("change", () => {
    if (els.relationship.value && els.setting.value && els.goal.value) els.contextError.textContent = "";
    state.reviewScrolled = false;
    renderContextImage();
    renderReviewSummary();
    renderChatMeta();
  });
}
els.reviewScreen.addEventListener("scroll", updateReviewGate);
for (const button of els.tabBar.querySelectorAll("button")) {
  button.addEventListener("click", () => {
    if (button.dataset.tab === "home" && state.sessionStarted) {
      goTo("chat");
      return;
    }
    goTo(button.dataset.tab);
  });
}

updateViewportHeight();
window.addEventListener("resize", updateViewportHeight);
window.visualViewport?.addEventListener("resize", updateViewportHeight);
window.visualViewport?.addEventListener("scroll", updateViewportHeight);

init().catch((error) => {
  state.messages = [{ role: "system", content: error.message }];
  state.currentScreen = "chat";
  render();
});
