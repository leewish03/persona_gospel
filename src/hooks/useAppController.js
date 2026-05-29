import { useCallback, useEffect, useMemo, useState } from "react";

import { deleteJson, getJson, postJson, putJson } from "@/lib/api";
import { flowScreens, profileDefaults, setupScreens } from "@/lib/constants";
import { markdownToHtml, sessionLabels } from "@/lib/format";

function isProfileComplete(profile = {}) {
  return Boolean(profile.name && profile.age && profile.gender && profile.church && profile.useCase);
}

function cleanProfile(profile = {}) {
  return { ...profileDefaults, ...profile };
}

function userMessageForError(error, context = "general") {
  const raw = String(error?.serverMessage || error?.message || "").trim();
  const status = Number(error?.status || 0);
  const code = error?.code || "";
  const lower = raw.toLowerCase();
  const network = !status && /failed to fetch|networkerror|load failed|abort|취소/.test(lower);
  const internal =
    status >= 500 ||
    /staticSystemBlocks|OPENAI_API_KEY|ANTHROPIC_API_KEY|api key|OpenAI|Claude|응답에서 텍스트|is not defined|ReferenceError|TypeError/i.test(raw);

  if (network) return "네트워크 연결이 불안정합니다. 연결 상태를 확인한 뒤 다시 시도해주세요.";
  if (code === "PROFILE_REQUIRED") return "훈련을 시작하려면 먼저 기본 정보를 입력해주세요.";
  if (code === "USAGE_LIMIT_REACHED") return raw || "오늘 이용 가능한 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  if (code === "CSRF_REQUIRED") return "보안 토큰이 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.";
  if (code === "RATE_LIMITED") return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  if (code === "PAYLOAD_TOO_LARGE") return "입력한 내용이 너무 깁니다. 내용을 줄인 뒤 다시 시도해주세요.";
  if (status === 401) return "로그인이 필요합니다. 다시 로그인한 뒤 이용해주세요.";
  if (status === 403) return raw || "이 작업을 사용할 권한이 없습니다.";
  if (status === 404) {
    if (context === "historyDetail" || context === "adminDetail") return "해당 훈련 기록을 찾지 못했습니다. 목록을 새로고침한 뒤 다시 열어주세요.";
    return raw || "요청한 정보를 찾지 못했습니다.";
  }
  if (context === "contextValidation") return "관계, 상황, 훈련 초점을 모두 선택해주세요.";
  if (context === "start") {
    if (internal) return "훈련을 시작하지 못했습니다. 잠시 후 다시 시도해주세요. 문제가 계속되면 관리자에게 알려주세요.";
    return raw || "훈련을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (context === "chat") {
    if (internal) return "상대역 응답을 불러오지 못했습니다. 잠시 후 다시 보내주세요.";
    return raw || "메시지를 보내지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (context === "feedback") {
    if (internal) return "피드백을 생성하지 못했습니다. 대화 내용은 저장되어 있으니 잠시 후 다시 시도해주세요.";
    return raw || "피드백을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (context === "profile") return raw || "기본 정보를 저장하지 못했습니다. 입력값을 확인한 뒤 다시 시도해주세요.";
  if (context === "appFeedback") return raw || "피드백을 보내지 못했습니다. 잠시 후 다시 시도해주세요.";
  if (context === "auth") return raw || "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.";
  if (context === "admin" || context === "adminDetail") {
    if (internal) return "관리자 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return raw || "관리자 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
  if (context === "historyDelete") return "기록을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";
  if (context === "history" || context === "historyDetail") return raw || "훈련 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  if (internal) return "요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
  return raw || "요청 처리 중 오류가 발생했습니다.";
}

function safeFileSegment(value = "") {
  return (
    String(value || "훈련기록")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "훈련기록"
  );
}

function conversationExportText(conversation = {}, personas = []) {
  const labels = sessionLabels(conversation.session || {}, personas);
  const status = conversation.status === "finished" ? "완료" : "진행 중";
  const lines = [
    "복음 대화 훈련소 훈련기록",
    "",
    `페르소나: ${labels.persona}`,
    `생성일: ${new Date(conversation.createdAt || Date.now()).toLocaleString("ko-KR")}`,
    `상태: ${status}`,
    `관계: ${labels.relationship}`,
    `상황: ${labels.setting}`,
    `훈련 초점: ${labels.goal}`,
    "",
    "대화 전문"
  ];
  for (const message of conversation.messages || []) {
    const speaker = message.role === "user" ? "나" : labels.persona;
    lines.push("", `[${speaker}]`, message.content || "");
  }
  lines.push("", "피드백 리포트", conversation.feedbackText || "아직 피드백이 없습니다.");
  return lines.join("\n");
}

function conversationExportFilename(conversation = {}, personas = []) {
  const labels = sessionLabels(conversation.session || {}, personas);
  const date = new Date(conversation.createdAt || Date.now()).toISOString().slice(0, 10);
  return `훈련기록-${safeFileSegment(labels.persona)}-${date}.txt`;
}

export function useAppController() {
  const [personas, setPersonas] = useState([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [currentScreen, setCurrentScreen] = useState("home");
  const [screenStack, setScreenStack] = useState([]);
  const [auth, setAuth] = useState({ user: null, devLoginEnabled: false, googleEnabled: false, kakaoEnabled: false });
  const [profileForm, setProfileForm] = useState(profileDefaults);
  const [contextForm, setContextForm] = useState({ relationship: "", setting: "", goal: "" });
  const [errors, setErrors] = useState({ auth: "", profile: "", context: "", global: "" });
  const [appSettings, setAppSettings] = useState({});
  const [activeSession, setActiveSession] = useState(null);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [latestFeedbackText, setLatestFeedbackText] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [sessionStarted, setSessionStarted] = useState(false);
  const [waitingForAssistant, setWaitingForAssistant] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(true);
  const [history, setHistory] = useState({ items: [], stats: null, filters: {}, detail: null, loading: false });
  const [admin, setAdmin] = useState({
    data: null,
    filters: { q: "", status: "", from: "", to: "" },
    loading: false,
    conversationDetail: null,
    userEditor: null
  });
  const [shareNotice, setShareNotice] = useState("");
  const [pendingDialog, setPendingDialog] = useState(null);
  const [appFeedbackForm, setAppFeedbackForm] = useState("");
  const [appFeedbackCategory, setAppFeedbackCategory] = useState("general");
  const [appFeedbackNotice, setAppFeedbackNotice] = useState("");

  const hasUser = Boolean(auth.user);
  const profileComplete = Boolean(auth.user?.profileComplete || isProfileComplete(auth.user?.profile));
  const isAdmin = auth.user?.role === "admin";
  const currentPersona = useMemo(
    () => personas.find((persona) => persona.id === selectedPersonaId) || personas[0] || null,
    [personas, selectedPersonaId]
  );
  const currentSession = useMemo(
    () => activeSession || { personaId: selectedPersonaId, ...contextForm },
    [activeSession, selectedPersonaId, contextForm]
  );

  const fillProfileForm = useCallback((user = auth.user) => {
    setProfileForm(cleanProfile({ ...user?.profile, name: user?.profile?.name || user?.displayName || "" }));
  }, [auth.user]);

  const goTo = useCallback(
    (screen, options = {}) => {
      if (isBusy) return false;
      if (!options.confirmed && currentScreen === "chat" && sessionStarted && screen !== "chat" && screen !== "feedback") {
        setPendingDialog({ type: "navigation", target: screen, options });
        return false;
      }
      if (["persona", "context", "review", "chat"].includes(screen)) {
        if (!hasUser) {
          setCurrentScreen("login");
          return false;
        }
        if (!profileComplete) {
          fillProfileForm();
          setCurrentScreen("profile");
          return false;
        }
      }
      if (screen === "review") setReviewConfirmed(false);
      if (!options.fromHistory && !options.replace && currentScreen && currentScreen !== screen) {
        setScreenStack((stack) => [...stack.slice(-29), currentScreen]);
      }
      setErrors((value) => ({ ...value, context: "", profile: "", global: "" }));
      if (!options.keepNotice) setShareNotice("");
      setCurrentScreen(screen);
      return true;
    },
    [currentScreen, fillProfileForm, hasUser, isBusy, profileComplete, sessionStarted]
  );

  const previousScreen = useCallback(() => {
    if (isBusy || (currentScreen === "chat" && sessionStarted) || currentScreen === "home") return;
    setScreenStack((stack) => {
      const next = [...stack];
      while (next.length) {
        const previous = next.pop();
        if (previous && previous !== currentScreen) {
          setShareNotice("");
          setCurrentScreen(previous);
          return next;
        }
      }
      const index = flowScreens.indexOf(currentScreen);
      setShareNotice("");
      setCurrentScreen(index > 0 ? flowScreens[index - 1] : "home");
      return next;
    });
  }, [currentScreen, isBusy, sessionStarted]);

  const resetAll = useCallback(() => {
    if (isBusy) return;
    if (sessionStarted) {
      setPendingDialog({ type: "reset" });
      return;
    }
    setScreenStack([]);
    setActiveSession(null);
    setConversationId("");
    setMessages([]);
    setLatestFeedbackText("");
    setFeedbackError("");
    setSessionStarted(false);
    setWaitingForAssistant(false);
    setContextForm({ relationship: "", setting: "", goal: "" });
    setShareNotice("");
    setCurrentScreen("home");
  }, [isBusy, sessionStarted]);

  const resetAllConfirmed = useCallback(() => {
    setScreenStack([]);
    setActiveSession(null);
    setConversationId("");
    setMessages([]);
    setLatestFeedbackText("");
    setFeedbackError("");
    setSessionStarted(false);
    setWaitingForAssistant(false);
    setContextForm({ relationship: "", setting: "", goal: "" });
    setShareNotice("");
    setCurrentScreen("home");
    setPendingDialog(null);
  }, []);

  const loadHistory = useCallback(async (filters = history.filters) => {
    setHistory((value) => ({ ...value, filters, loading: true }));
    try {
      const query = new URLSearchParams();
      for (const key of ["q", "personaId", "goal", "status"]) {
        if (filters[key]) query.set(key, filters[key]);
      }
      const [stats, data] = await Promise.all([getJson("/api/me/stats"), getJson(`/api/conversations?${query}`)]);
      setHistory((value) => ({ ...value, stats, items: data.conversations || [], filters, loading: false }));
    } catch (error) {
      setErrors((value) => ({ ...value, global: userMessageForError(error, "history") }));
      setHistory((value) => ({ ...value, loading: false }));
    }
  }, [history.filters]);

  const loadHistoryDetail = useCallback(async (id) => {
    if (!id) return;
    setHistory((value) => ({ ...value, detail: null, loading: true }));
    try {
      const data = await getJson(`/api/conversations/${encodeURIComponent(id)}`);
      setHistory((value) => ({ ...value, detail: data.conversation, loading: false }));
    } catch (error) {
      setErrors((value) => ({ ...value, global: userMessageForError(error, "historyDetail") }));
      setHistory((value) => ({ ...value, loading: false }));
    }
  }, []);

  const saveHistoryDetail = useCallback(() => {
    const detail = history.detail;
    if (!detail) return;
    const text = conversationExportText(detail, personas);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = conversationExportFilename(detail, personas);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setShareNotice("훈련 기록 파일을 저장했습니다.");
  }, [history.detail, personas]);

  const copyHistoryDetail = useCallback(async () => {
    const detail = history.detail;
    if (!detail) return;
    try {
      await navigator.clipboard.writeText(conversationExportText(detail, personas));
      setShareNotice("훈련 기록을 클립보드에 복사했습니다.");
    } catch {
      setShareNotice("복사하지 못했습니다. 브라우저 권한을 확인한 뒤 다시 시도해주세요.");
    }
  }, [history.detail, personas]);

  const requestDeleteHistoryDetail = useCallback((id) => {
    if (!id) return;
    setPendingDialog({ type: "historyDelete", id });
  }, []);

  const exportMyData = useCallback(async () => {
    setIsBusy(true);
    setShareNotice("");
    try {
      const data = await getJson("/api/me/export");
      const blob = new Blob([JSON.stringify(data.export || data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `복음대화훈련소-내데이터-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setShareNotice("내 데이터를 저장했습니다.");
    } catch (error) {
      setShareNotice(userMessageForError(error));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const requestDeleteAccount = useCallback(() => {
    setPendingDialog({ type: "accountDelete" });
  }, []);

  const deleteAccountConfirmed = useCallback(async () => {
    setIsBusy(true);
    try {
      await deleteJson("/api/me");
      setPendingDialog(null);
      setAuth((value) => ({ ...value, user: null, limits: null }));
      resetAllConfirmed();
      setShareNotice("계정이 삭제되었습니다.");
      setCurrentScreen("home");
    } catch (error) {
      setPendingDialog(null);
      setErrors((value) => ({ ...value, global: userMessageForError(error) }));
    } finally {
      setIsBusy(false);
    }
  }, [resetAllConfirmed]);

  const deleteHistoryDetailConfirmed = useCallback(async (id) => {
    if (!id) return;
    setIsBusy(true);
    try {
      await deleteJson(`/api/conversations/${encodeURIComponent(id)}`);
      setPendingDialog(null);
      setHistory((value) => ({
        ...value,
        detail: null,
        items: value.items.filter((item) => item.id !== id),
        loading: false
      }));
      if (conversationId === id) {
        setActiveSession(null);
        setConversationId("");
        setMessages([]);
        setLatestFeedbackText("");
        setFeedbackError("");
        setSessionStarted(false);
        setWaitingForAssistant(false);
      }
      await loadHistory();
      goTo("history", { confirmed: true, keepNotice: true });
      setShareNotice("훈련 기록을 삭제했습니다.");
    } catch (error) {
      setPendingDialog(null);
      setErrors((value) => ({ ...value, global: userMessageForError(error, "historyDelete") }));
    } finally {
      setIsBusy(false);
    }
  }, [conversationId, goTo, loadHistory]);

  const loadAdmin = useCallback(async (filters = admin.filters) => {
    if (!isAdmin) return;
    setAdmin((value) => ({
      ...value,
      filters,
      loading: true,
      conversationDetail: null,
      userEditor: null
    }));
    try {
      const query = new URLSearchParams();
      if (filters.q) query.set("q", filters.q);
      if (filters.status) query.set("status", filters.status);
      if (filters.from) query.set("from", filters.from);
      if (filters.to) query.set("to", filters.to);
      const userQuery = filters.q ? `?q=${encodeURIComponent(filters.q)}&limit=200` : "?limit=200";
      const [summary, users, conversations, usage, settings, logs, appFeedbacks] = await Promise.all([
        getJson("/api/admin/summary"),
        getJson(`/api/admin/users${userQuery}`),
        getJson(`/api/admin/conversations?${query}&limit=200`),
        getJson(`/api/admin/usage?${query}&limit=500`),
        getJson("/api/admin/settings"),
        getJson("/api/admin/logs?limit=100"),
        getJson("/api/admin/app-feedbacks?limit=100")
      ]);
      setAdmin((value) => ({
        ...value,
        filters,
        loading: false,
        data: { summary, users, conversations, usage, settings, logs, appFeedbacks }
      }));
    } catch (error) {
      setErrors((value) => ({ ...value, global: userMessageForError(error, "admin") }));
      setAdmin((value) => ({ ...value, loading: false }));
    }
  }, [admin.filters, isAdmin]);

  const loadAdminConversationDetail = useCallback(async (id) => {
    if (!isAdmin || !id) return;
    setAdmin((value) => ({
      ...value,
      userEditor: null,
      conversationDetail: { id, loading: true, conversation: null, error: "" }
    }));
    try {
      const data = await getJson(`/api/admin/conversations/${encodeURIComponent(id)}`);
      setAdmin((value) => ({
        ...value,
        conversationDetail: { id, loading: false, conversation: data.conversation, error: "" }
      }));
    } catch (error) {
      const message = userMessageForError(error, "adminDetail");
      setErrors((value) => ({ ...value, global: message }));
      setAdmin((value) => ({
        ...value,
        conversationDetail: { id, loading: false, conversation: null, error: message }
      }));
    }
  }, [isAdmin]);

  const updateAdminAppFeedback = useCallback(async (id, patch) => {
    if (!id) return;
    try {
      await putJson(`/api/admin/app-feedbacks/${encodeURIComponent(id)}`, patch);
      await loadAdmin();
    } catch (error) {
      setErrors((value) => ({ ...value, global: userMessageForError(error, "admin") }));
    }
  }, [loadAdmin]);

  const closeAdminConversationDetail = useCallback(() => {
    setAdmin((value) => ({ ...value, conversationDetail: null }));
  }, []);

  const openAdminUserEditor = useCallback((user) => {
    setAdmin((value) => ({
      ...value,
      conversationDetail: null,
      userEditor: {
        id: user.id,
        email: user.email || "",
        displayName: user.displayName || "",
        role: user.role || "user",
        profile: cleanProfile(user.profile || {}),
        saving: false
      }
    }));
  }, []);

  const setAdminUserEditor = useCallback((patch) => {
    setAdmin((value) => {
      if (!value.userEditor) return value;
      return { ...value, userEditor: { ...value.userEditor, ...patch } };
    });
  }, []);

  const setAdminUserEditorProfile = useCallback((patch) => {
    setAdmin((value) => {
      if (!value.userEditor) return value;
      return {
        ...value,
        userEditor: {
          ...value.userEditor,
          profile: { ...value.userEditor.profile, ...patch }
        }
      };
    });
  }, []);

  const closeAdminUserEditor = useCallback(() => {
    setAdmin((value) => ({ ...value, userEditor: null }));
  }, []);

  const saveAdminUser = useCallback(async () => {
    const ed = admin.userEditor;
    if (!ed) return;
    const selfId = auth.user?.id;
    setAdmin((value) => (value.userEditor ? { ...value, userEditor: { ...value.userEditor, saving: true } } : value));
    try {
      await putJson(`/api/admin/users/${encodeURIComponent(ed.id)}`, {
        displayName: ed.displayName,
        profile: ed.profile,
        role: ed.role
      });
      await loadAdmin();
      if (selfId && ed.id === selfId) {
        try {
          const me = await getJson("/api/me");
          setAuth((v) => ({ ...v, user: me.user }));
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      setErrors((value) => ({ ...value, global: userMessageForError(error, "admin") }));
      setAdmin((value) =>
        value.userEditor ? { ...value, userEditor: { ...value.userEditor, saving: false } } : value
      );
    }
  }, [admin.userEditor, auth.user?.id, loadAdmin]);

  useEffect(() => {
    async function init() {
      try {
        const [personaResponse, me, settings] = await Promise.all([
          fetch("/data/personas.json"),
          getJson("/api/me"),
          getJson("/api/settings").catch(() => ({ settings: {} }))
        ]);
        const loadedPersonas = await personaResponse.json();
        setPersonas(loadedPersonas);
        setSelectedPersonaId(loadedPersonas[0]?.id || "");
        setAuth({
          user: me.user,
          limits: me.limits || null,
          devLoginEnabled: me.auth?.devLoginEnabled,
          googleEnabled: me.auth?.googleEnabled,
          kakaoEnabled: me.auth?.kakaoEnabled
        });
        setAppSettings(settings.settings || {});
        if (me.user && !me.user.profileComplete) {
          setProfileForm(cleanProfile({ ...me.user.profile, name: me.user.profile?.name || me.user.displayName || "" }));
          setCurrentScreen("profile");
        }
        const params = new URLSearchParams(window.location.search);
        const authError = params.get("authError");
        if (authError) {
          setErrors((value) => ({ ...value, auth: `로그인을 완료하지 못했습니다. (${authError})` }));
          window.history.replaceState({}, "", window.location.pathname);
          setCurrentScreen("login");
        }
      } catch (error) {
        setErrors((value) => ({ ...value, global: userMessageForError(error) }));
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (currentScreen === "history") void loadHistory();
    if (currentScreen === "admin") void loadAdmin();
  }, [currentScreen]);

  const validateContext = useCallback(() => {
    if (contextForm.relationship && contextForm.setting && contextForm.goal) return true;
    setErrors((value) => ({ ...value, context: userMessageForError(null, "contextValidation") }));
    return false;
  }, [contextForm]);

  const saveProfile = useCallback(async () => {
    const values = [profileForm.name, profileForm.age, profileForm.gender, profileForm.church, profileForm.useCase];
    if (!values.every((value) => String(value || "").trim())) {
      setErrors((value) => ({ ...value, profile: "이름, 나이, 성별, 소속 교회, 사용 용도를 모두 입력해주세요." }));
      return;
    }
    setIsBusy(true);
    try {
      const data = await postJson("/api/profile", { profile: profileForm });
      setAuth((value) => ({ ...value, user: data.user }));
      goTo("home", { replace: true });
    } catch (error) {
      setErrors((value) => ({ ...value, profile: userMessageForError(error, "profile") }));
    } finally {
      setIsBusy(false);
    }
  }, [goTo, profileForm]);

  const devLogin = useCallback(async () => {
    setErrors((value) => ({ ...value, auth: "" }));
    try {
      const data = await postJson("/api/dev-login", { email: "dev@example.local", displayName: "개발용 사용자" });
      setAuth((value) => ({ ...value, user: data.user, limits: data.limits || value.limits }));
      fillProfileForm(data.user);
      setCurrentScreen(data.user.profileComplete ? "home" : "profile");
    } catch (error) {
      setErrors((value) => ({ ...value, auth: userMessageForError(error, "auth") }));
    }
  }, [fillProfileForm]);

  const logout = useCallback(async () => {
    await postJson("/api/logout");
    setAuth((value) => ({ ...value, user: null, limits: null }));
    resetAllConfirmed();
  }, [resetAllConfirmed]);

  const startSession = useCallback(async () => {
    if (!validateContext()) return;
    const session = { personaId: selectedPersonaId, ...contextForm };
    setLatestFeedbackText("");
    setFeedbackError("");
    setActiveSession(session);
    setSessionStarted(true);
    setWaitingForAssistant(true);
    setMessages([]);
    setConversationId("");
    setCurrentScreen("chat");
    setIsBusy(true);
    try {
      const data = await postJson("/api/start", { session });
      if (data.limits) setAuth((value) => ({ ...value, limits: data.limits }));
      setConversationId(data.conversationId || "");
      if (data.visibleScene) setActiveSession({ ...session, visibleScene: data.visibleScene });
      setMessages([{ role: "assistant", content: data.text }]);
      setWaitingForAssistant(false);
    } catch (error) {
      setSessionStarted(false);
      setActiveSession(null);
      setMessages([]);
      setWaitingForAssistant(false);
      setErrors((value) => ({ ...value, context: userMessageForError(error, "start") }));
      setCurrentScreen("context");
    } finally {
      setIsBusy(false);
    }
  }, [contextForm, selectedPersonaId, validateContext]);

  const submitMessage = useCallback(async (content) => {
    const clean = String(content || "").trim();
    if (!clean || isBusy || !sessionStarted) return;
    const nextMessages = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setWaitingForAssistant(true);
    setIsBusy(true);
    try {
      const data = await postJson("/api/chat", {
        conversationId,
        session: currentSession,
        messages: nextMessages.filter((message) => message.role !== "system")
      });
      if (data.limits) setAuth((value) => ({ ...value, limits: data.limits }));
      setMessages([...nextMessages, { role: "assistant", content: data.text }]);
      setWaitingForAssistant(false);
    } catch (error) {
      if ([404, 409].includes(Number(error?.status || 0))) {
        setConversationId("");
        setActiveSession(null);
        setSessionStarted(false);
      }
      setMessages([...nextMessages, { role: "system", content: userMessageForError(error, "chat") }]);
      setWaitingForAssistant(false);
    } finally {
      setIsBusy(false);
    }
  }, [conversationId, currentSession, isBusy, messages, sessionStarted]);

  const finishSession = useCallback(async () => {
    const userTurns = messages.filter((message) => message.role === "user").length;
    if (!userTurns || isBusy || !sessionStarted) return;
    setPendingDialog({ type: "feedback" });
  }, [isBusy, messages, sessionStarted]);

  const finishSessionConfirmed = useCallback(async () => {
    const userTurns = messages.filter((message) => message.role === "user").length;
    if (!userTurns || isBusy || !sessionStarted) return;
    setPendingDialog(null);
    if (latestFeedbackText) {
      setSessionStarted(false);
      setCurrentScreen("feedback");
      return;
    }
    setFeedbackError("");
    setIsBusy(true);
    setCurrentScreen("feedback");
    try {
      const data = await postJson("/api/feedback", {
        conversationId,
        session: currentSession,
        messages: messages.filter((message) => message.role !== "system")
      });
      if (data.limits) setAuth((value) => ({ ...value, limits: data.limits }));
      setLatestFeedbackText(data.text);
      setFeedbackError("");
      setSessionStarted(false);
    } catch (error) {
      setLatestFeedbackText("");
      setFeedbackError(userMessageForError(error, "feedback"));
      if ([404, 409].includes(Number(error?.status || 0))) {
        setConversationId("");
        setActiveSession(null);
        setSessionStarted(false);
      } else {
        setSessionStarted(true);
      }
    } finally {
      setIsBusy(false);
    }
  }, [conversationId, currentSession, isBusy, latestFeedbackText, messages, sessionStarted]);

  const retryFeedback = useCallback(async () => {
    if (isBusy || !sessionStarted) return;
    await finishSessionConfirmed();
  }, [finishSessionConfirmed, isBusy, sessionStarted]);

  const returnToChatFromFeedback = useCallback(() => {
    if (isBusy) return;
    setCurrentScreen(sessionStarted ? "chat" : "history");
  }, [isBusy, sessionStarted]);

  const cancelPendingDialog = useCallback(() => {
    setPendingDialog(null);
  }, []);

  const confirmPendingDialog = useCallback(async () => {
    const pending = pendingDialog;
    if (!pending) return;
    if (pending.type === "navigation") {
      setPendingDialog(null);
      goTo(pending.target, { ...(pending.options || {}), confirmed: true });
      return;
    }
    if (pending.type === "reset") {
      resetAllConfirmed();
      return;
    }
    if (pending.type === "feedback") {
      await finishSessionConfirmed();
      return;
    }
    if (pending.type === "historyDelete") {
      await deleteHistoryDetailConfirmed(pending.id);
      return;
    }
    if (pending.type === "accountDelete") {
      await deleteAccountConfirmed();
    }
  }, [deleteAccountConfirmed, deleteHistoryDetailConfirmed, finishSessionConfirmed, goTo, pendingDialog, resetAllConfirmed]);

  const restoreSession = useCallback((session = {}) => {
    setSelectedPersonaId(session.personaId || selectedPersonaId);
    setContextForm({ relationship: session.relationship || "", setting: session.setting || "", goal: session.goal || "" });
    setActiveSession(null);
    setConversationId("");
    setMessages([]);
    setLatestFeedbackText("");
    setFeedbackError("");
    setSessionStarted(false);
    setWaitingForAssistant(false);
    setReviewConfirmed(false);
    goTo("review");
  }, [goTo, selectedPersonaId]);

  const resumeConversation = useCallback((conversation = {}) => {
    const session = conversation.session || {};
    setSelectedPersonaId(session.personaId || selectedPersonaId);
    setContextForm({ relationship: session.relationship || "", setting: session.setting || "", goal: session.goal || "" });
    setActiveSession({ personaId: session.personaId || selectedPersonaId, relationship: session.relationship || "", setting: session.setting || "", goal: session.goal || "" });
    setConversationId(conversation.id || "");
    setMessages(conversation.messages || []);
    setLatestFeedbackText(conversation.feedbackText || "");
    setFeedbackError("");
    setSessionStarted(conversation.status !== "finished");
    setWaitingForAssistant(false);
    setCurrentScreen("chat");
  }, [selectedPersonaId]);

  const continueHistoryConversation = useCallback(async (id) => {
    if (!id) return;
    setIsBusy(true);
    try {
      const data = await getJson(`/api/conversations/${encodeURIComponent(id)}`);
      if (!data.conversation || data.conversation.status === "finished") {
        setErrors((value) => ({ ...value, global: "이미 완료된 기록입니다. 같은 설정으로 다시 시작해주세요." }));
        return;
      }
      resumeConversation(data.conversation);
    } catch (error) {
      setErrors((value) => ({ ...value, global: userMessageForError(error, "historyDetail") }));
    } finally {
      setIsBusy(false);
    }
  }, [resumeConversation]);

  const shareFeedback = useCallback(async () => {
    if (!latestFeedbackText || !currentPersona) return;
    const labels = sessionLabels(currentSession, personas);
    const shareText = ["복음 대화 훈련소 피드백 리포트", "", `페르소나: ${labels.persona}`, `관계: ${labels.relationship}`, `상황: ${labels.setting}`, `훈련 초점: ${labels.goal}`, "", latestFeedbackText].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "복음 대화 훈련소 피드백 리포트", text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShareNotice("리포트를 클립보드에 복사했습니다.");
    } catch (error) {
      if (error?.name !== "AbortError") setShareNotice("공유를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  }, [currentPersona, currentSession, latestFeedbackText, personas]);

  const saveAdminSettings = useCallback(async (settings) => {
    const data = await putJson("/api/admin/settings", { settings });
    setAppSettings(data.settings);
    await loadAdmin();
    return data.settings;
  }, [loadAdmin]);

  const submitAppFeedback = useCallback(async () => {
    const message = appFeedbackForm.trim();
    if (!message || isBusy) return;
    setIsBusy(true);
    setAppFeedbackNotice("");
    try {
      const data = await postJson("/api/app-feedback", { message, category: appFeedbackCategory, page: currentScreen });
      if (data.limits) setAuth((value) => ({ ...value, limits: data.limits }));
      setAppFeedbackForm("");
      setAppFeedbackCategory("general");
      setAppFeedbackNotice("피드백을 보냈습니다. 개선에 참고하겠습니다.");
    } catch (error) {
      setAppFeedbackNotice(userMessageForError(error, "appFeedback"));
    } finally {
      setIsBusy(false);
    }
  }, [appFeedbackCategory, appFeedbackForm, currentScreen, isBusy]);

  const handlePrimaryAction = useCallback(async () => {
    if (currentScreen === "home") {
      if (!hasUser) return goTo("login");
      if (!profileComplete) {
        fillProfileForm();
        return goTo("profile");
      }
      return goTo("persona");
    }
    if (currentScreen === "profile") return saveProfile();
    if (currentScreen === "context") return validateContext() && goTo("review");
    if (currentScreen === "review") {
      if (!reviewConfirmed) {
        setReviewConfirmed(true);
        return;
      }
      return startSession();
    }
    if (currentScreen === "chat") return finishSession();
    if (currentScreen === "feedback") return shareFeedback();
    const index = flowScreens.indexOf(currentScreen);
    if (index >= 0 && index < flowScreens.length - 1) return goTo(flowScreens[index + 1]);
  }, [currentScreen, fillProfileForm, finishSession, goTo, hasUser, profileComplete, reviewConfirmed, saveProfile, shareFeedback, startSession, validateContext]);

  const handleSecondaryAction = useCallback(async () => {
    if (currentScreen === "persona" && personas.length) {
      setSelectedPersonaId(personas[Math.floor(Math.random() * personas.length)].id);
      return;
    }
    if (currentScreen === "context") {
      const random = (items) => items[Math.floor(Math.random() * items.length)];
      setContextForm({
        relationship: random(["first_meeting", "acquaintance", "casual_friend", "old_friend", "prior_faith_talk"]),
        setting: random(["cafe_catchup", "meal_after_group", "walk_after_work", "late_night_dm", "campus_or_office_break", "concern_shared", "faith_topic_arose"]),
        goal: random(["listen_and_understand", "ask_better_questions", "connect_to_faith", "explain_gospel_core", "respond_to_barrier", "share_personal_witness"])
      });
      setErrors((value) => ({ ...value, context: "" }));
      return;
    }
    if (currentScreen === "feedback") {
      setMessages([]);
      setLatestFeedbackText("");
      setFeedbackError("");
      setSessionStarted(false);
      await startSession();
    }
  }, [currentScreen, personas, startSession]);

  return {
    state: {
      personas,
      selectedPersonaId,
      currentScreen,
      setupProgress: setupScreens.includes(currentScreen) ? ((setupScreens.indexOf(currentScreen) + 1) / setupScreens.length) * 100 : ((Math.max(0, flowScreens.indexOf(currentScreen)) + 1) / flowScreens.length) * 100,
      auth,
      profileForm,
      contextForm,
      errors,
      appSettings,
      activeSession,
      currentSession,
      currentPersona,
      conversationId,
      messages,
      latestFeedbackText,
      latestFeedbackHtml: markdownToHtml(latestFeedbackText),
      feedbackError,
      sessionStarted,
      waitingForAssistant,
      isBusy,
      reviewConfirmed,
      history,
      admin,
      shareNotice,
      pendingDialog,
      appFeedbackForm,
      appFeedbackCategory,
      appFeedbackNotice,
      hasUser,
      profileComplete,
      isAdmin
    },
    actions: {
      setSelectedPersonaId,
      setProfileForm,
      setContextForm,
      setErrors,
      setReviewConfirmed,
      setHistory,
      setAdmin,
      setAppFeedbackForm,
      setAppFeedbackCategory,
      cancelPendingDialog,
      confirmPendingDialog,
      goTo,
      previousScreen,
      resetAll,
      saveProfile,
      devLogin,
      logout,
      startSession,
      submitMessage,
      finishSession,
      retryFeedback,
      returnToChatFromFeedback,
      restoreSession,
      resumeConversation,
      continueHistoryConversation,
      loadHistory,
      loadHistoryDetail,
      saveHistoryDetail,
      copyHistoryDetail,
      requestDeleteHistoryDetail,
      loadAdmin,
      loadAdminConversationDetail,
      closeAdminConversationDetail,
      openAdminUserEditor,
      closeAdminUserEditor,
      setAdminUserEditor,
      setAdminUserEditorProfile,
      saveAdminUser,
      updateAdminAppFeedback,
      saveAdminSettings,
      submitAppFeedback,
      exportMyData,
      requestDeleteAccount,
      shareFeedback,
      handlePrimaryAction,
      handleSecondaryAction
    }
  };
}
