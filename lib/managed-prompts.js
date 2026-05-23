/**
 * Langfuse Prompt Management catalog (file fallbacks + seed list).
 * Edit prompts in Langfuse UI (staging/production); files are source-of-truth for Git + seed.
 */

import { join } from "node:path";

/** @param {string[]} segments */
export function promptFilePath(rootDir, segments) {
  return join(rootDir, ...segments);
}

/** @type {{ name: string, segments: string[], variables?: boolean }[]} */
export const MANAGED_PROMPTS = [
  { name: "roleplay/persona-system", segments: ["prompts", "persona-system-prompt.md"] },
  { name: "roleplay/feedback-system", segments: ["prompts", "feedback-prompt.md"] },
  { name: "roleplay/chat-dynamic", segments: ["prompts", "langfuse", "chat-dynamic.md"], variables: true },
  { name: "roleplay/chat-initial", segments: ["prompts", "langfuse", "chat-initial.md"], variables: true },
  { name: "roleplay/pas-turn-hint", segments: ["prompts", "langfuse", "pas-turn-hint.md"], variables: true },
  { name: "roleplay/feedback-rubric/listen_and_understand", segments: ["prompts", "langfuse", "feedback-rubric", "listen_and_understand.md"] },
  { name: "roleplay/feedback-rubric/ask_better_questions", segments: ["prompts", "langfuse", "feedback-rubric", "ask_better_questions.md"] },
  { name: "roleplay/feedback-rubric/connect_to_faith", segments: ["prompts", "langfuse", "feedback-rubric", "connect_to_faith.md"] },
  { name: "roleplay/feedback-rubric/explain_gospel_core", segments: ["prompts", "langfuse", "feedback-rubric", "explain_gospel_core.md"] },
  { name: "roleplay/feedback-rubric/respond_to_barrier", segments: ["prompts", "langfuse", "feedback-rubric", "respond_to_barrier.md"] },
  { name: "roleplay/feedback-rubric/share_personal_witness", segments: ["prompts", "langfuse", "feedback-rubric", "share_personal_witness.md"] }
];

export const FEEDBACK_RUBRIC_GOALS = [
  "listen_and_understand",
  "ask_better_questions",
  "connect_to_faith",
  "explain_gospel_core",
  "respond_to_barrier",
  "share_personal_witness"
];

export function feedbackRubricPromptName(goal) {
  const key = FEEDBACK_RUBRIC_GOALS.includes(goal) ? goal : "listen_and_understand";
  return `roleplay/feedback-rubric/${key}`;
}
