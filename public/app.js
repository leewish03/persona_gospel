const flowScreens = ["home", "persona", "context", "review", "chat", "feedback"];
const setupScreens = ["persona", "context", "review"];

const state = {
  personas: [],
  selectedPersonaId: null,
  currentScreen: "home",
  screenStack: [],
  auth: { user: null, devLoginEnabled: false, googleEnabled: false, kakaoEnabled: false },
  activeSession: null,
  conversationId: "",
  messages: [],
  latestFeedbackText: "",
  sessionStarted: false,
  waitingForAssistant: false,
  isBusy: false,
  historyLoaded: false,
  historyItems: [],
  selectedHistoryId: "",
  historyStats: null,
  historyFilters: {},
  appSettings: null,
  adminLoaded: false,
  reviewScrolled: false,
  keyboardOpen: false,
  inputFocused: false
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
  historyDetailPanel: document.querySelector("#historyDetailPanel"),
  accountPanel: document.querySelector("#accountPanel"),
  donationPanel: document.querySelector("#donationPanel"),
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
  cafe_catchup: "카페에서 대화를 나누는 중",
  meal_after_group: "식사/모임 후 둘만 남아 이야기하는 중",
  walk_after_work: "퇴근길에 함께 걸어가는 중",
  late_night_dm: "밤에 카톡/DM으로 진지한 이야기가 이어지는 중",
  campus_or_office_break: "학교/직장 쉬는 시간에 잠깐 마주 앉은 중",
  concern_shared: "페르소나가 고민을 털어놓은 직후",
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
  historyDetail: { eyebrow: "History", title: "기록 상세" },
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

function goTo(screen, options = {}) {
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
  if (!options.fromHistory && !options.replace && state.currentScreen && state.currentScreen !== screen) {
    state.screenStack.push(state.currentScreen);
    if (state.screenStack.length > 30) state.screenStack.shift();
  }
  state.currentScreen = screen;
  if (screen !== "context") els.contextError.textContent = "";
  if (screen !== "profile") els.profileError.textContent = "";
  if (screen === "history") void loadHistory();
  if (screen === "historyDetail") void loadHistoryDetail(state.selectedHistoryId);
  if (screen === "settings") renderSettings();
  if (screen === "admin") void loadAdmin();
  render();
}

function updateViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  const keyboardOpen = Boolean(
    state.currentScreen === "chat" &&
      (state.inputFocused || (window.visualViewport && window.innerHeight - window.visualViewport.height > 140))
  );
  document.documentElement.style.setProperty("--app-height", `${height}px`);
  if (state.keyboardOpen !== keyboardOpen) {
    state.keyboardOpen = keyboardOpen;
    document.body.classList.toggle("keyboard-open", keyboardOpen);
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

  while (state.screenStack.length) {
    const previous = state.screenStack.pop();
    if (previous && previous !== state.currentScreen) {
      goTo(previous, { fromHistory: true });
      return;
    }
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
  const actionless = ["login", "history", "historyDetail", "settings", "admin"].includes(state.currentScreen);
  els.bottomBar.hidden =
    actionless ||
    (state.currentScreen === "chat" && state.sessionStarted && (state.messages.length < 2 || state.keyboardOpen));
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
  if (state.waitingForAssistant && persona) {
    const node = els.messageTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add("assistant", "typing");
    const avatar = node.querySelector(".message-avatar");
    const role = node.querySelector(".message-role");
    const body = node.querySelector(".message-body");
    avatar.src = personaImages[persona.id];
    avatar.alt = `${persona.name} 프로필 이미지`;
    avatar.removeAttribute("aria-hidden");
    role.textContent = persona.name;
    body.innerHTML = `
      <span class="typing-dots" aria-label="응답 작성 중">
        <span></span><span></span><span></span>
      </span>
    `;
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
  renderDonationPanel();
}

function renderDonationPanel() {
  const donation = state.appSettings?.donation || {};
  if (donation.enabled === false) {
    els.donationPanel.innerHTML = `<h3>후원</h3><p>후원 안내는 준비 중입니다.</p>`;
    return;
  }
  els.donationPanel.innerHTML = `
    <h3>${donation.title || "후원"}</h3>
    <p>${donation.body || "이 앱의 AI 호출 비용은 운영자가 부담합니다. 지속 운영을 돕고 싶다면 자발적으로 후원할 수 있습니다."}</p>
    <div class="donation-box">
      <strong>후원 계좌</strong>
      <span>${donation.account || "추후 입력"}</span>
    </div>
  `;
}

function optionList(options, selected) {
  return options
    .map((option) => `<option value="${option.value}" ${selected === option.value ? "selected" : ""}>${option.label}</option>`)
    .join("");
}

function modelSettingsFields(kind, title, settings = {}) {
  const prefix = kind === "feedback" ? "feedback" : "chat";
  const provider = settings.provider || "openai";
  const reasoning = settings.reasoningEffort || "none";
  const thinkingType = settings.thinkingType || "disabled";
  const thinkingDisplay = settings.thinkingDisplay || "omitted";
  const defaultModel = prefix === "feedback" ? "gpt-5.4" : "chat-latest";
  return `
    <fieldset class="model-fieldset">
      <legend>${title}</legend>
      <label class="field">
        <span>공급자</span>
        <select name="${prefix}Provider">
          ${optionList(
            [
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Claude / Anthropic" }
            ],
            provider
          )}
        </select>
      </label>
      <label class="field">
        <span>모델</span>
        <input name="${prefix}Model" value="${escapeHtml(settings.model || defaultModel)}" list="${prefix}ModelPresets" />
        <datalist id="${prefix}ModelPresets">
          <option value="chat-latest"></option>
          <option value="gpt-5.4"></option>
          <option value="gpt-5.4-mini"></option>
          <option value="claude-sonnet-4-6"></option>
          <option value="claude-haiku-4-5-20251001"></option>
          <option value="claude-opus-4-7"></option>
        </datalist>
      </label>
      <div class="model-grid">
        <label class="field"><span>최대 출력 토큰</span><input name="${prefix}MaxOutputTokens" type="number" min="1" max="64000" value="${Number(settings.maxOutputTokens || (prefix === "feedback" ? 2600 : 1400))}" /></label>
        <label class="field"><span>Temperature</span><input name="${prefix}Temperature" type="number" min="0" max="2" step="0.1" value="${settings.temperature ?? ""}" placeholder="기본값" /></label>
        <label class="field"><span>Top P</span><input name="${prefix}TopP" type="number" min="0" max="1" step="0.05" value="${settings.topP ?? ""}" placeholder="기본값" /></label>
        <label class="field">
          <span>OpenAI reasoning</span>
          <select name="${prefix}ReasoningEffort">
            ${optionList(
              [
                { value: "none", label: "없음" },
                { value: "minimal", label: "minimal" },
                { value: "low", label: "low" },
                { value: "medium", label: "medium" },
                { value: "high", label: "high" },
                { value: "xhigh", label: "xhigh" }
              ],
              reasoning
            )}
          </select>
        </label>
        <label class="field">
          <span>Claude thinking</span>
          <select name="${prefix}ThinkingType">
            ${optionList(
              [
                { value: "disabled", label: "사용 안 함" },
                { value: "adaptive", label: "adaptive" },
                { value: "enabled", label: "manual budget" }
              ],
              thinkingType
            )}
          </select>
        </label>
        <label class="field"><span>Thinking budget</span><input name="${prefix}ThinkingBudgetTokens" type="number" min="1024" max="64000" value="${Number(settings.thinkingBudgetTokens || 0)}" /></label>
        <label class="field">
          <span>Thinking 표시</span>
          <select name="${prefix}ThinkingDisplay">
            ${optionList(
              [
                { value: "omitted", label: "숨김" },
                { value: "summarized", label: "요약" }
              ],
              thinkingDisplay
            )}
          </select>
        </label>
      </div>
    </fieldset>
  `;
}

function sessionLabels(session = {}) {
  return {
    persona: state.personas.find((entry) => entry.id === session.personaId)?.name || "페르소나",
    relationship: relationshipText[session.relationship] || session.relationship || "",
    setting: settingText[session.setting] || session.setting || "",
    goal: goalText[session.goal] || session.goal || ""
  };
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function restoreSession(session = {}) {
  state.selectedPersonaId = session.personaId || state.selectedPersonaId;
  els.relationship.value = session.relationship || "";
  els.setting.value = session.setting || "";
  els.goal.value = session.goal || "";
  state.activeSession = null;
  state.conversationId = "";
  state.messages = [];
  state.latestFeedbackText = "";
  state.sessionStarted = false;
  state.waitingForAssistant = false;
  state.reviewScrolled = false;
  renderContextImage();
  renderReviewSummary();
  goTo("review");
}

function resumeConversation(conversation = {}) {
  const session = conversation.session || {};
  state.selectedPersonaId = session.personaId || state.selectedPersonaId;
  els.relationship.value = session.relationship || "";
  els.setting.value = session.setting || "";
  els.goal.value = session.goal || "";
  state.activeSession = {
    personaId: state.selectedPersonaId,
    relationship: els.relationship.value,
    setting: els.setting.value,
    goal: els.goal.value
  };
  state.conversationId = conversation.id || "";
  state.messages = conversation.messages || [];
  state.latestFeedbackText = conversation.feedbackText || "";
  state.sessionStarted = conversation.status !== "finished";
  state.waitingForAssistant = false;
  state.reviewScrolled = false;
  els.feedbackPanel.innerHTML = "";
  renderContextImage();
  renderReviewSummary();
  renderChatMeta();
  renderMessages();
  goTo("chat");
  requestAnimationFrame(() => els.messageInput.focus());
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
  state.waitingForAssistant = true;
  state.messages = [];
  state.conversationId = "";
  els.feedbackPanel.innerHTML = "";
  goTo("chat");
  setBusy(true, "primary");

  try {
    const data = await postJson("/api/start", { session: currentSession() });
    state.conversationId = data.conversationId || "";
    state.waitingForAssistant = false;
    state.messages.push({ role: "assistant", content: data.text });
    state.historyLoaded = false;
    render();
    els.messageInput.focus();
  } catch (error) {
    state.sessionStarted = false;
    state.activeSession = null;
    state.waitingForAssistant = false;
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
  state.waitingForAssistant = true;
  els.messageInput.value = "";
  renderMessages();
  setBusy(true, "chat");

  try {
    const data = await postJson("/api/chat", {
      conversationId: state.conversationId,
      session: currentSession(),
      messages: state.messages.filter((message) => message.role !== "system")
    });
    state.waitingForAssistant = false;
    state.messages.push({ role: "assistant", content: data.text });
    state.historyLoaded = false;
    render();
  } catch (error) {
    state.waitingForAssistant = false;
    addSystemMessage(error.message);
  } finally {
    setBusy(false);
    els.messageInput.focus();
  }
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let listType = "";

  const renderInline = (value) =>
    escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = "";
  };
  const openList = (type) => {
    flushParagraph();
    if (listType === type) return;
    closeList();
    listType = type;
    html.push(`<${type}>`);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);

    if (!line) {
      flushParagraph();
      closeList();
    } else if (heading) {
      flushParagraph();
      closeList();
      html.push(`<h2>${renderInline(heading[2])}</h2>`);
    } else if (bullet) {
      openList("ul");
      html.push(`<li>${renderInline(bullet[1])}</li>`);
    } else if (ordered) {
      openList("ol");
      html.push(`<li>${renderInline(ordered[1])}</li>`);
    } else {
      closeList();
      paragraph.push(line);
    }
  }

  flushParagraph();
  closeList();
  return html.join("");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFeedbackLoading() {
  els.feedbackPanel.innerHTML = `
    <img class="feedback-visual" src="/assets/feedback-report.jpg" alt="노트와 말풍선이 놓인 피드백 이미지" />
    <h3>피드백 리포트</h3>
    <p>대화 내용을 바탕으로 피드백을 생성하고 있습니다.</p>
  `;
}

function renderFeedbackReport(text) {
  els.feedbackPanel.innerHTML = `
    <img class="feedback-visual" src="/assets/feedback-report.jpg" alt="노트와 말풍선이 놓인 피드백 이미지" />
    <h3>피드백 리포트</h3>
    <div class="feedback-content">${markdownToHtml(text)}</div>
  `;
}

function renderFeedbackError(message) {
  els.feedbackPanel.innerHTML = `
    <div class="feedback-error" role="alert">
      <h3>피드백을 생성하지 못했습니다</h3>
      <p>${escapeHtml(message || "일시적인 오류가 발생했습니다.")}</p>
      <p>대화 내용은 저장되어 있습니다. 잠시 후 다시 시도하거나 대화 화면으로 돌아가 이어서 훈련할 수 있습니다.</p>
      <div class="feedback-error-actions">
        <button class="primary-button" type="button" id="retryFeedbackButton">다시 시도</button>
        <button class="secondary-button" type="button" id="returnToChatButton">대화로 돌아가기</button>
      </div>
    </div>
  `;
  document.querySelector("#retryFeedbackButton")?.addEventListener("click", () => {
    void finishSession();
  });
  document.querySelector("#returnToChatButton")?.addEventListener("click", () => {
    state.sessionStarted = true;
    goTo("chat");
    requestAnimationFrame(() => els.messageInput.focus());
  });
}

async function finishSession() {
  if (state.latestFeedbackText) {
    state.sessionStarted = false;
    goTo("feedback");
    return;
  }
  state.latestFeedbackText = "";
  state.waitingForAssistant = false;
  setBusy(true, "primary");
  goTo("feedback");
  renderFeedbackLoading();

  try {
    const data = await postJson("/api/feedback", {
      conversationId: state.conversationId,
      session: currentSession(),
      messages: state.messages.filter((message) => message.role !== "system")
    });
    state.latestFeedbackText = data.text;
    renderFeedbackReport(data.text);
    state.sessionStarted = false;
    state.historyLoaded = false;
    setBusy(false);
  } catch (error) {
    state.latestFeedbackText = "";
    renderFeedbackError(error.message);
    state.sessionStarted = true;
    state.historyLoaded = false;
    setBusy(false);
  }
}

async function loadHistory() {
  els.historyList.innerHTML = `<p class="helper">기록을 불러오는 중입니다.</p>`;
  try {
    const query = new URLSearchParams();
    const existingForm = document.querySelector("#historyFilters");
    if (existingForm) {
      for (const key of ["q", "personaId", "goal", "status"]) {
        const value = existingForm.elements[key]?.value;
        if (value) query.set(key, value);
        state.historyFilters[key] = value || "";
      }
    }
    const [stats, data] = await Promise.all([getJson("/api/me/stats"), getJson(`/api/conversations?${query}`)]);
    state.historyLoaded = true;
    state.historyStats = stats;
    state.historyItems = data.conversations || [];
    if (!data.conversations.length) {
      els.historyList.innerHTML = renderHistoryShell(`<p class="helper">조건에 맞는 훈련 기록이 없습니다.</p>`);
      bindHistoryEvents();
      return;
    }
    els.historyList.innerHTML = renderHistoryShell(
      data.conversations
        .map((item) => {
          const labels = sessionLabels(item.session);
          const isActive = item.status !== "finished";
          return `
            <article class="history-item">
              <strong>${labels.persona} · ${isActive ? "진행 중" : "완료"}</strong>
              <span>${formatDate(item.createdAt)}</span>
              <p>${labels.relationship} · ${labels.setting}</p>
              <p><b>훈련 초점</b> ${labels.goal}</p>
              ${item.feedbackSummary ? `<p class="history-summary">${item.feedbackSummary}</p>` : ""}
              <div class="history-actions">
                <button class="secondary-button" type="button" data-history-detail="${item.id}">상세</button>
                ${
                  isActive
                    ? `<button class="secondary-button" type="button" data-history-continue="${item.id}">대화 이어가기</button>`
                    : `<button class="secondary-button" type="button" data-history-repeat="${item.id}">같은 설정으로 다시</button>`
                }
              </div>
            </article>
          `;
        })
        .join("")
    );
    bindHistoryEvents();
  } catch (error) {
    els.historyList.innerHTML = `<p class="form-error">${error.message}</p>`;
  }
}

function renderHistoryShell(content) {
  const stats = state.historyStats || {};
  const topGoal = stats.byGoal?.[0]?.goal ? goalText[stats.byGoal[0].goal] || stats.byGoal[0].goal : "아직 없음";
  const recent = stats.recentFeedbackThemes?.[0] || "피드백이 쌓이면 반복되는 훈련 포인트를 보여줍니다.";
  return `
    <section class="history-summary-panel">
      <div><strong>${stats.totalConversations || 0}</strong><span>전체 훈련</span></div>
      <div><strong>${stats.thisMonthConversations || 0}</strong><span>이번 달</span></div>
      <p><b>주요 초점</b> ${topGoal}</p>
      <p><b>최근 피드백</b> ${recent}</p>
    </section>
    <form class="filter-bar" id="historyFilters">
      <input name="q" type="search" placeholder="검색" value="${state.historyFilters.q || ""}" />
      <select name="personaId">
        <option value="">전체 페르소나</option>
        ${state.personas
          .map((persona) => `<option value="${persona.id}" ${state.historyFilters.personaId === persona.id ? "selected" : ""}>${persona.name}</option>`)
          .join("")}
      </select>
      <select name="goal">
        <option value="">전체 초점</option>
        ${Object.entries(goalText)
          .map(([value, label]) => `<option value="${value}" ${state.historyFilters.goal === value ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
      <select name="status">
        <option value="">전체 상태</option>
        <option value="finished" ${state.historyFilters.status === "finished" ? "selected" : ""}>완료</option>
        <option value="active" ${state.historyFilters.status === "active" ? "selected" : ""}>진행 중</option>
      </select>
      <button class="secondary-button" type="submit">적용</button>
    </form>
    <div class="history-list-inner">${content}</div>
  `;
}

function bindHistoryEvents() {
  const form = document.querySelector("#historyFilters");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void loadHistory();
    });
  }
  for (const button of els.historyList.querySelectorAll("[data-history-detail]")) {
    button.addEventListener("click", () => {
      state.selectedHistoryId = button.dataset.historyDetail;
      goTo("historyDetail");
    });
  }
  for (const button of els.historyList.querySelectorAll("[data-history-repeat]")) {
    button.addEventListener("click", () => {
      const item = state.historyItems.find((entry) => entry.id === button.dataset.historyRepeat);
      if (item) restoreSession(item.session);
    });
  }
  for (const button of els.historyList.querySelectorAll("[data-history-continue]")) {
    button.addEventListener("click", () => {
      void continueHistoryConversation(button.dataset.historyContinue);
    });
  }
}

async function continueHistoryConversation(id) {
  if (!id) return;
  setBusy(true);
  try {
    const data = await getJson(`/api/conversations/${encodeURIComponent(id)}`);
    const item = data.conversation;
    if (!item || item.status === "finished") {
      els.historyList.innerHTML = `<p class="form-error">이미 완료된 기록입니다. 같은 설정으로 다시 시작해주세요.</p>`;
      return;
    }
    resumeConversation(item);
  } catch (error) {
    els.historyList.innerHTML = `<p class="form-error">${error.message}</p>`;
  } finally {
    setBusy(false);
  }
}

async function loadHistoryDetail(id) {
  if (!id) {
    els.historyDetailPanel.innerHTML = `<p class="form-error">선택된 훈련 기록이 없습니다.</p>`;
    return;
  }
  els.historyDetailPanel.innerHTML = `<p class="helper">기록을 불러오는 중입니다.</p>`;
  try {
    const data = await getJson(`/api/conversations/${encodeURIComponent(id)}`);
    const item = data.conversation;
    const labels = sessionLabels(item.session);
    const isActive = item.status !== "finished";
    els.historyDetailPanel.innerHTML = `
      <article class="history-detail-card">
        <h3>${labels.persona}</h3>
        <p>${formatDate(item.createdAt)}</p>
        <dl class="profile-list">
          <dt>관계</dt><dd>${labels.relationship}</dd>
          <dt>상황</dt><dd>${labels.setting}</dd>
          <dt>훈련 초점</dt><dd>${labels.goal}</dd>
          <dt>상태</dt><dd>${isActive ? "진행 중" : "완료"}</dd>
        </dl>
        <button class="secondary-button full-width" type="button" id="historyActionButton">
          ${isActive ? "대화 이어가기" : "같은 설정으로 다시 훈련"}
        </button>
      </article>
      <article class="history-detail-card">
        <h3>대화 전문</h3>
        <div class="transcript">
          ${(item.messages || [])
            .map(
              (message) =>
                `<p class="${message.role}"><b>${message.role === "user" ? "나" : labels.persona}</b>${escapeHtml(message.content)}</p>`
            )
            .join("")}
        </div>
      </article>
      <article class="history-detail-card">
        <h3>피드백 리포트</h3>
        <div class="feedback-content">
          ${
            item.feedbackText
              ? markdownToHtml(item.feedbackText)
              : `<p>${isActive ? "대화를 이어가거나 종료하면 피드백을 받을 수 있습니다." : "아직 피드백이 없습니다."}</p>`
          }
        </div>
      </article>
    `;
    document.querySelector("#historyActionButton").addEventListener("click", () => {
      if (isActive) resumeConversation(item);
      else restoreSession(item.session);
    });
  } catch (error) {
    els.historyDetailPanel.innerHTML = `<p class="form-error">${error.message}</p>`;
  }
}

async function loadAdmin() {
  if (!isAdmin()) {
    els.adminPanel.innerHTML = `<p class="form-error">관리자 권한이 필요합니다.</p>`;
    return;
  }
  els.adminPanel.innerHTML = `<p class="helper">관리자 데이터를 불러오는 중입니다.</p>`;
  try {
    const [summary, users, conversations, usage, settings] = await Promise.all([
      getJson("/api/admin/summary"),
      getJson("/api/admin/users?limit=50"),
      getJson("/api/admin/conversations?limit=50"),
      getJson("/api/admin/usage"),
      getJson("/api/admin/settings")
    ]);
    const donation = settings.settings?.donation || {};
    const cost = settings.settings?.cost || {};
    const ai = settings.settings?.ai || {};
    els.adminPanel.innerHTML = `
      <section class="admin-section">
        <h3>개요</h3>
        <div class="admin-grid">
          <article><strong>${summary.users}</strong><span>가입 사용자</span></article>
          <article><strong>${summary.completedProfiles}</strong><span>프로필 완료</span></article>
          <article><strong>${summary.conversations}</strong><span>전체 훈련</span></article>
          <article><strong>${summary.finishedConversations}</strong><span>완료 훈련</span></article>
          <article><strong>${summary.thisMonthConversations}</strong><span>이번 달 훈련</span></article>
          <article><strong>${Math.round(summary.estimatedMonthlyCostKrw || 0).toLocaleString("ko-KR")}원</strong><span>이번 달 예상 비용</span></article>
        </div>
      </section>
      <section class="admin-section">
        <h3>사용량</h3>
        <div class="usage-panel">
          <p>대화 시작 ${usage.usage.byType.chat_start || 0}회 · 메시지 ${usage.usage.byType.chat_message || 0}회 · 피드백 ${usage.usage.byType.feedback || 0}회</p>
          <p>입력 ${usage.usage.monthlyInputTokens.toLocaleString("ko-KR")} tokens · 출력 ${usage.usage.monthlyOutputTokens.toLocaleString("ko-KR")} tokens</p>
          <p>월 예산 기준 ${Number(cost.monthlyBudgetKrw || 0).toLocaleString("ko-KR")}원</p>
        </div>
      </section>
      <section class="admin-section">
        <h3>사용자</h3>
        <div class="admin-table">
          ${
            users.users.length
              ? users.users
                  .map(
                    (user) => `
                <article>
                  <strong>${escapeHtml(user.profile?.name || user.displayName || user.email)}</strong>
                  <span>${escapeHtml(user.email || "")}</span>
                  <span>${escapeHtml(user.profile?.church || "소속 미입력")} · ${escapeHtml(user.profile?.useCase || "용도 미입력")}</span>
                  <span>훈련 ${user.conversationCount}회 · 완료 ${user.finishedConversationCount}회</span>
                </article>
              `
                  )
                  .join("")
              : `<p class="admin-empty">아직 등록된 사용자가 없습니다.</p>`
          }
        </div>
      </section>
      <section class="admin-section">
        <h3>최근 훈련</h3>
        <div class="admin-table">
          ${
            conversations.conversations.length
              ? conversations.conversations
                  .map((item) => {
                    const labels = sessionLabels(item.session);
                    return `
                <article>
                  <strong>${escapeHtml(item.user?.name || item.user?.email || "사용자")} · ${labels.persona}</strong>
                  <span>${formatDate(item.createdAt)}</span>
                  <span>${labels.relationship} · ${labels.setting}</span>
                  <span>${labels.goal} · 메시지 ${item.messageCount}개</span>
                </article>
              `;
                  })
                  .join("")
              : `<p class="admin-empty">아직 저장된 훈련 기록이 없습니다.</p>`
          }
        </div>
      </section>
      <section class="admin-section">
        <h3>운영 설정</h3>
        <form class="admin-settings-form" id="adminSettingsForm">
          <h4>모델 설정</h4>
          <p class="admin-note">API 키는 환경변수로 관리합니다. OpenAI는 OPENAI_API_KEY, Claude는 ANTHROPIC_API_KEY를 사용합니다.</p>
          ${modelSettingsFields("chat", "대화 모델", ai.chat || {})}
          ${modelSettingsFields("feedback", "피드백 모델", ai.feedback || {})}
          <h4>후원/비용 설정</h4>
          <label class="field"><span>후원 제목</span><input name="title" value="${escapeHtml(donation.title || "후원")}" /></label>
          <label class="field"><span>후원 안내</span><textarea name="body" rows="4">${escapeHtml(donation.body || "")}</textarea></label>
          <label class="field"><span>후원 계좌/링크</span><input name="account" value="${escapeHtml(donation.account || "")}" placeholder="나중에 입력" /></label>
          <label class="field"><span>원/달러 환율</span><input name="usdToKrw" type="number" value="${Number(cost.usdToKrw || 1380)}" /></label>
          <label class="field"><span>월 예산 기준</span><input name="monthlyBudgetKrw" type="number" value="${Number(cost.monthlyBudgetKrw || 0)}" /></label>
          <button class="primary-button" type="submit">운영 설정 저장</button>
          <p class="form-status" id="adminSettingsStatus" role="status"></p>
        </form>
      </section>
    `;
    bindAdminEvents();
  } catch (error) {
    els.adminPanel.innerHTML = `<p class="form-error">${error.message}</p>`;
  }
}

function bindAdminEvents() {
  const form = document.querySelector("#adminSettingsForm");
  if (!form) return;
  const readModelSettings = (prefix) => ({
    provider: form.elements[`${prefix}Provider`].value,
    model: form.elements[`${prefix}Model`].value.trim(),
    maxOutputTokens: Number(form.elements[`${prefix}MaxOutputTokens`].value || 0),
    temperature: form.elements[`${prefix}Temperature`].value,
    topP: form.elements[`${prefix}TopP`].value,
    reasoningEffort: form.elements[`${prefix}ReasoningEffort`].value,
    thinkingType: form.elements[`${prefix}ThinkingType`].value,
    thinkingBudgetTokens: Number(form.elements[`${prefix}ThinkingBudgetTokens`].value || 0),
    thinkingDisplay: form.elements[`${prefix}ThinkingDisplay`].value
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#adminSettingsStatus");
    status.textContent = "";
    status.classList.remove("is-error");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            donation: {
              title: form.elements.title.value,
              body: form.elements.body.value,
              account: form.elements.account.value,
              enabled: true
            },
            cost: {
              usdToKrw: Number(form.elements.usdToKrw.value || 1380),
              monthlyBudgetKrw: Number(form.elements.monthlyBudgetKrw.value || 0)
            },
            ai: {
              chat: readModelSettings("chat"),
              feedback: readModelSettings("feedback")
            }
          }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "운영 설정을 저장하지 못했습니다.");
      state.appSettings = data.settings;
      status.textContent = "저장했습니다.";
      renderDonationPanel();
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error.message;
    }
  });
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
  state.screenStack = [];
  state.activeSession = null;
  state.conversationId = "";
  state.messages = [];
  state.latestFeedbackText = "";
  state.sessionStarted = false;
  state.waitingForAssistant = false;
  els.feedbackPanel.innerHTML = "";
  resetContextSelections();
  goTo("home", { replace: true });
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

async function loadAppSettings() {
  try {
    const data = await getJson("/api/settings");
    state.appSettings = data.settings || {};
  } catch {
    state.appSettings = {};
  }
}

async function init() {
  const [personaResponse] = await Promise.all([fetch("/data/personas.json"), loadAuth(), loadAppSettings()]);
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
  state.inputFocused = true;
  updateViewportHeight();
  requestAnimationFrame(scrollMessagesToBottom);
});
els.messageInput.addEventListener("blur", () => {
  setTimeout(() => {
    state.inputFocused = false;
    updateViewportHeight();
  }, 80);
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
