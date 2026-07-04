export const PWA_INSTALL_PROMPT_STORAGE_KEY = "pwaInstallPromptState";
export const PWA_INSTALL_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function createPwaInstallPromptState(overrides = {}) {
  return {
    firstShownAt: 0,
    lastDismissedAt: 0,
    dismissedCount: 0,
    lastTrainingFinishedAt: 0,
    lastTrainingPromptedAt: 0,
    installedAt: 0,
    ...overrides
  };
}

export function parsePwaInstallPromptState(value) {
  if (!value) return createPwaInstallPromptState();
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return createPwaInstallPromptState();
    return createPwaInstallPromptState({
      firstShownAt: Number(parsed.firstShownAt || 0),
      lastDismissedAt: Number(parsed.lastDismissedAt || 0),
      dismissedCount: Number(parsed.dismissedCount || 0),
      lastTrainingFinishedAt: Number(parsed.lastTrainingFinishedAt || 0),
      lastTrainingPromptedAt: Number(parsed.lastTrainingPromptedAt || 0),
      installedAt: Number(parsed.installedAt || 0)
    });
  } catch {
    return createPwaInstallPromptState();
  }
}

export function serializePwaInstallPromptState(state) {
  return JSON.stringify(createPwaInstallPromptState(state));
}

export function getPwaInstallPromptDecision({
  state,
  now,
  isInstalled,
  isPromptSupported,
  isIosSafari,
  isInActiveChat
}) {
  const promptState = createPwaInstallPromptState(state);
  const canExplainInstall = Boolean(isPromptSupported || isIosSafari);
  if (isInstalled || promptState.installedAt) return { shouldShow: false, reason: "installed" };
  if (!canExplainInstall) return { shouldShow: false, reason: "unsupported" };
  if (isInActiveChat) return { shouldShow: false, reason: "active-chat" };
  if (!promptState.firstShownAt) return { shouldShow: true, reason: "first-visit" };
  if (promptState.lastTrainingFinishedAt > promptState.lastTrainingPromptedAt) {
    return { shouldShow: true, reason: "training-finished" };
  }
  if (promptState.lastDismissedAt && now - promptState.lastDismissedAt < PWA_INSTALL_PROMPT_COOLDOWN_MS) {
    return { shouldShow: false, reason: "cooldown" };
  }
  return { shouldShow: true, reason: promptState.lastDismissedAt ? "cooldown-expired" : "eligible" };
}

export function markPwaInstallPromptShown(state, now, reason = "") {
  const next = createPwaInstallPromptState(state);
  if (!next.firstShownAt) next.firstShownAt = now;
  if (reason === "training-finished") next.lastTrainingPromptedAt = Math.max(next.lastTrainingPromptedAt, next.lastTrainingFinishedAt);
  return next;
}

export function markPwaInstallPromptDismissed(state, now) {
  const next = createPwaInstallPromptState(state);
  if (!next.firstShownAt) next.firstShownAt = now;
  next.lastDismissedAt = now;
  next.dismissedCount += 1;
  return next;
}

export function markPwaTrainingFinished(state, now) {
  const next = createPwaInstallPromptState(state);
  next.lastTrainingFinishedAt = Math.max(next.lastTrainingFinishedAt, now);
  return next;
}

export function markPwaInstalled(state, now) {
  return createPwaInstallPromptState({ ...state, installedAt: now });
}

export function isIosSafariInstallTarget({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Android/i.test(ua);
  const isIosDevice = /iPad|iPhone|iPod/i.test(platform) || (/Mac/i.test(platform) && Number(maxTouchPoints) > 1);
  return isSafari && isIosDevice;
}
