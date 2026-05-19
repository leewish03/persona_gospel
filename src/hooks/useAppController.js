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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          setCurrentScreen(previous);
          return next;
        }
      }
      const index = flowScreens.indexOf(currentScreen);
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
    setSessionStarted(false);
    setWaitingForAssistant(false);
    setContextForm({ relationship: "", setting: "", goal: "" });
    setCurrentScreen("home");
  }, [isBusy, sessionStarted]);

  const resetAllConfirmed = useCallback(() => {
    setScreenStack([]);
    setActiveSession(null);
    setConversationId("");
    setMessages([]);
    setLatestFeedbackText("");
    setSessionStarted(false);
    setWaitingForAssistant(false);
    setContextForm({ relationship: "", setting: "", goal: "" });
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
      setErrors((value) => ({ ...value, global: error.message }));
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
      setErrors((value) => ({ ...value, global: error.message }));
      setHistory((value) => ({ ...value, loading: false }));
    }
  }, []);

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
      const [summary, users, conversations, usage, settings, openingLines] = await Promise.all([
        getJson("/api/admin/summary"),
        getJson(`/api/admin/users${userQuery}`),
        getJson(`/api/admin/conversations?${query}&limit=200`),
        getJson(`/api/admin/usage?${query}&limit=500`),
        getJson("/api/admin/settings"),
        getJson("/api/admin/opening-lines")
      ]);
      setAdmin((value) => ({
        ...value,
        filters,
        loading: false,
        data: { summary, users, conversations, usage, settings, openingLines }
      }));
    } catch (error) {
      setErrors((value) => ({ ...value, global: error.message }));
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
      setErrors((value) => ({ ...value, global: error.message }));
      setAdmin((value) => ({
        ...value,
        conversationDetail: { id, loading: false, conversation: null, error: error.message || "불러오기 실패" }
      }));
    }
  }, [isAdmin]);

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
      setErrors((value) => ({ ...value, global: error.message }));
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
        setErrors((value) => ({ ...value, global: error.message }));
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
    setErrors((value) => ({ ...value, context: "관계, 상황, 훈련 초점을 모두 선택해주세요." }));
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
      setErrors((value) => ({ ...value, profile: error.message }));
    } finally {
      setIsBusy(false);
    }
  }, [goTo, profileForm]);

  const devLogin = useCallback(async () => {
    setErrors((value) => ({ ...value, auth: "" }));
    try {
      const data = await postJson("/api/dev-login", { email: "dev@example.local", displayName: "개발용 사용자" });
      setAuth((value) => ({ ...value, user: data.user }));
      fillProfileForm(data.user);
      setCurrentScreen(data.user.profileComplete ? "home" : "profile");
    } catch (error) {
      setErrors((value) => ({ ...value, auth: error.message }));
    }
  }, [fillProfileForm]);

  const logout = useCallback(async () => {
    await postJson("/api/logout");
    setAuth((value) => ({ ...value, user: null }));
    resetAll();
  }, [resetAll]);

  const startSession = useCallback(async () => {
    if (!validateContext()) return;
    const session = { personaId: selectedPersonaId, ...contextForm };
    setLatestFeedbackText("");
    setActiveSession(session);
    setSessionStarted(true);
    setWaitingForAssistant(true);
    setMessages([]);
    setConversationId("");
    setCurrentScreen("chat");
    setIsBusy(true);
    try {
      const data = await postJson("/api/start", { session });
      setConversationId(data.conversationId || "");
      if (data.visibleScene) setActiveSession({ ...session, visibleScene: data.visibleScene });
      setMessages([{ role: "assistant", content: data.text }]);
      setWaitingForAssistant(false);
    } catch (error) {
      setSessionStarted(false);
      setActiveSession(null);
      setMessages([]);
      setWaitingForAssistant(false);
      setErrors((value) => ({ ...value, context: error.message }));
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
      setMessages([...nextMessages, { role: "assistant", content: data.text }]);
      setWaitingForAssistant(false);
    } catch (error) {
      setMessages([...nextMessages, { role: "system", content: error.message }]);
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
    setIsBusy(true);
    setCurrentScreen("feedback");
    try {
      const data = await postJson("/api/feedback", {
        conversationId,
        session: currentSession,
        messages: messages.filter((message) => message.role !== "system")
      });
      setLatestFeedbackText(data.text);
      setSessionStarted(false);
    } catch (error) {
      setLatestFeedbackText(`## 피드백 생성 실패\n${error.message}`);
      setSessionStarted(false);
    } finally {
      setIsBusy(false);
    }
  }, [conversationId, currentSession, isBusy, latestFeedbackText, messages, sessionStarted]);

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
    }
  }, [finishSessionConfirmed, goTo, pendingDialog, resetAllConfirmed]);

  const restoreSession = useCallback((session = {}) => {
    setSelectedPersonaId(session.personaId || selectedPersonaId);
    setContextForm({ relationship: session.relationship || "", setting: session.setting || "", goal: session.goal || "" });
    setActiveSession(null);
    setConversationId("");
    setMessages([]);
    setLatestFeedbackText("");
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
      setErrors((value) => ({ ...value, global: error.message }));
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

  const startOpeningLinesJob = useCallback(async () => {
    if (!isAdmin) return;
    setAdmin((value) => ({
      ...value,
      data: value.data
        ? { ...value.data, openingLines: { ...(value.data.openingLines || {}), currentJob: { status: "queued", completed: 0, total: 108 } } }
        : value.data
    }));
    try {
      const started = await postJson("/api/admin/opening-lines");
      let currentJob = started.job;
      setAdmin((value) => ({
        ...value,
        data: value.data
          ? { ...value.data, openingLines: { ...(value.data.openingLines || {}), currentJob } }
          : value.data
      }));
      while (currentJob?.id && ["queued", "running", "cancelling"].includes(currentJob.status)) {
        await wait(2500);
        const data = await getJson(`/api/admin/opening-lines/${encodeURIComponent(currentJob.id)}`);
        currentJob = data.job;
        setAdmin((value) => ({
          ...value,
          data: value.data
            ? { ...value.data, openingLines: { ...(value.data.openingLines || {}), currentJob } }
            : value.data
        }));
      }
      const openingLines = await getJson("/api/admin/opening-lines");
      setAdmin((value) => ({
        ...value,
        data: value.data ? { ...value.data, openingLines: { ...openingLines, currentJob } } : value.data
      }));
    } catch (error) {
      setErrors((value) => ({ ...value, global: error.message }));
      setAdmin((value) => ({
        ...value,
        data: value.data
          ? {
              ...value.data,
              openingLines: {
                ...(value.data.openingLines || {}),
                currentJob: { ...(value.data.openingLines?.currentJob || {}), status: "failed", error: error.message }
              }
            }
          : value.data
      }));
    }
  }, [isAdmin]);

  const cancelOpeningLinesJob = useCallback(async (jobId) => {
    if (!isAdmin || !jobId) return;
    try {
      const data = await deleteJson(`/api/admin/opening-lines/${encodeURIComponent(jobId)}`);
      setAdmin((value) => ({
        ...value,
        data: value.data
          ? { ...value.data, openingLines: { ...(value.data.openingLines || {}), currentJob: data.job } }
          : value.data
      }));
    } catch (error) {
      setErrors((value) => ({ ...value, global: error.message }));
    }
  }, [isAdmin]);

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
      sessionStarted,
      waitingForAssistant,
      isBusy,
      reviewConfirmed,
      history,
      admin,
      shareNotice,
      pendingDialog,
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
      restoreSession,
      resumeConversation,
      continueHistoryConversation,
      loadHistory,
      loadHistoryDetail,
      loadAdmin,
      loadAdminConversationDetail,
      closeAdminConversationDetail,
      openAdminUserEditor,
      closeAdminUserEditor,
      setAdminUserEditor,
      setAdminUserEditorProfile,
      saveAdminUser,
      saveAdminSettings,
      startOpeningLinesJob,
      cancelOpeningLinesJob,
      shareFeedback,
      handlePrimaryAction,
      handleSecondaryAction
    }
  };
}
