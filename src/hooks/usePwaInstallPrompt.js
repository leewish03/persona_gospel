import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PWA_INSTALL_PROMPT_STORAGE_KEY,
  getPwaInstallPromptDecision,
  isIosSafariInstallTarget,
  markPwaInstalled,
  markPwaInstallPromptDismissed,
  markPwaInstallPromptShown,
  markPwaTrainingFinished,
  parsePwaInstallPromptState,
  serializePwaInstallPromptState
} from "@/lib/pwaInstallPrompt";

function getStoredState() {
  if (typeof window === "undefined") return parsePwaInstallPromptState("");
  return parsePwaInstallPromptState(window.localStorage.getItem(PWA_INSTALL_PROMPT_STORAGE_KEY));
}

function persistState(state) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PWA_INSTALL_PROMPT_STORAGE_KEY, serializePwaInstallPromptState(state));
}

function getIsInstalled() {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone
  );
}

function getIsIosSafari() {
  if (typeof window === "undefined") return false;
  return isIosSafariInstallTarget({
    userAgent: window.navigator?.userAgent || "",
    platform: window.navigator?.platform || "",
    maxTouchPoints: window.navigator?.maxTouchPoints || 0
  });
}

export function usePwaInstallPrompt({ isInActiveChat = false, trainingFinishedSignal = "" } = {}) {
  const [installEvent, setInstallEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(getIsInstalled);
  const [state, setState] = useState(getStoredState);
  const [visible, setVisible] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const isIosSafari = useMemo(() => getIsIosSafari(), []);

  const updateState = useCallback((updater) => {
    setState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      persistState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      updateState((current) => markPwaInstalled(current, Date.now()));
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [updateState]);

  useEffect(() => {
    if (!trainingFinishedSignal) return;
    updateState((current) => markPwaTrainingFinished(current, Date.now()));
  }, [trainingFinishedSignal, updateState]);

  useEffect(() => {
    const decision = getPwaInstallPromptDecision({
      state,
      now: Date.now(),
      isInstalled,
      isPromptSupported: Boolean(installEvent),
      isIosSafari,
      isInActiveChat
    });
    setDecisionReason(decision.reason);
    if (!decision.shouldShow || visible) return;
    setVisible(true);
    updateState((current) => markPwaInstallPromptShown(current, Date.now(), decision.reason));
  }, [installEvent, isInActiveChat, isInstalled, isIosSafari, state, updateState, visible]);

  const dismiss = useCallback(() => {
    setVisible(false);
    updateState((current) => markPwaInstallPromptDismissed(current, Date.now()));
  }, [updateState]);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return false;
    installEvent.prompt();
    const result = await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
    if (result?.outcome === "accepted") {
      setIsInstalled(true);
      updateState((current) => markPwaInstalled(current, Date.now()));
      setVisible(false);
      return true;
    }
    dismiss();
    return false;
  }, [dismiss, installEvent, updateState]);

  return {
    canPromptInstall: Boolean(installEvent),
    decisionReason,
    dismiss,
    isInstalled,
    isIosSafari,
    promptInstall,
    visible
  };
}
