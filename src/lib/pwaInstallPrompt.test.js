import test from "node:test";
import assert from "node:assert/strict";

import {
  PWA_INSTALL_PROMPT_COOLDOWN_MS,
  createPwaInstallPromptState,
  getPwaInstallPromptDecision,
  markPwaInstallPromptDismissed,
  markPwaTrainingFinished
} from "./pwaInstallPrompt.js";

test("shows the install prompt on the first eligible visit", () => {
  const state = createPwaInstallPromptState();

  const decision = getPwaInstallPromptDecision({
    state,
    now: 1_000,
    isInstalled: false,
    isPromptSupported: true,
    isIosSafari: false,
    isInActiveChat: false
  });

  assert.equal(decision.shouldShow, true);
  assert.equal(decision.reason, "first-visit");
});

test("hides the install prompt during cooldown after dismissal", () => {
  const dismissed = markPwaInstallPromptDismissed(createPwaInstallPromptState(), 2_000);

  const decision = getPwaInstallPromptDecision({
    state: dismissed,
    now: 2_000 + PWA_INSTALL_PROMPT_COOLDOWN_MS - 1,
    isInstalled: false,
    isPromptSupported: true,
    isIosSafari: false,
    isInActiveChat: false
  });

  assert.equal(decision.shouldShow, false);
  assert.equal(decision.reason, "cooldown");
});

test("shows the install prompt after cooldown expires", () => {
  const dismissed = markPwaInstallPromptDismissed(createPwaInstallPromptState(), 2_000);

  const decision = getPwaInstallPromptDecision({
    state: dismissed,
    now: 2_000 + PWA_INSTALL_PROMPT_COOLDOWN_MS,
    isInstalled: false,
    isPromptSupported: true,
    isIosSafari: false,
    isInActiveChat: false
  });

  assert.equal(decision.shouldShow, true);
  assert.equal(decision.reason, "cooldown-expired");
});

test("shows the install prompt after a training session finishes even before cooldown", () => {
  const dismissed = markPwaInstallPromptDismissed(createPwaInstallPromptState(), 2_000);
  const finished = markPwaTrainingFinished(dismissed, 3_000);

  const decision = getPwaInstallPromptDecision({
    state: finished,
    now: 3_000,
    isInstalled: false,
    isPromptSupported: true,
    isIosSafari: false,
    isInActiveChat: false
  });

  assert.equal(decision.shouldShow, true);
  assert.equal(decision.reason, "training-finished");
});

test("does not show the install prompt when already installed or while chatting", () => {
  const state = createPwaInstallPromptState();

  assert.equal(
    getPwaInstallPromptDecision({
      state,
      now: 1_000,
      isInstalled: true,
      isPromptSupported: true,
      isIosSafari: false,
      isInActiveChat: false
    }).shouldShow,
    false
  );

  assert.equal(
    getPwaInstallPromptDecision({
      state,
      now: 1_000,
      isInstalled: false,
      isPromptSupported: true,
      isIosSafari: false,
      isInActiveChat: true
    }).shouldShow,
    false
  );
});
