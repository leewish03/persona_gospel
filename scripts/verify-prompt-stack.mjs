#!/usr/bin/env node
/**
 * 코드 범위에서 페르소나·Langfuse 프롬프트 스택 검증.
 * Usage: node scripts/verify-prompt-stack.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MANAGED_PROMPTS, FEEDBACK_RUBRIC_GOALS, promptFilePath } from "../lib/managed-prompts.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const personas = JSON.parse(readFileSync(join(root, "data/personas.json"), "utf8"));

const REQUIRED_TEMPLATE_KEYS = [
  "personalWorld",
  "experienceAnchors",
  "interpretationRules",
  "speechFingerprint"
];

let failed = 0;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed += 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

for (const item of MANAGED_PROMPTS) {
  const path = promptFilePath(root, item.segments);
  if (!existsSync(path)) fail(`missing managed prompt file: ${item.name} -> ${path}`);
  else ok(`managed prompt file: ${item.name}`);
}

const personaPrompt = readFileSync(join(root, "prompts/persona-system-prompt.md"), "utf8");
if (!/personalWorld|speechFingerprint|concreteWordBank/.test(personaPrompt)) {
  fail("persona-system-prompt.md should reference detailed persona card fields");
} else {
  ok("persona-system-prompt.md references detailed persona fields");
}

const chatDynamic = readFileSync(join(root, "prompts/langfuse/chat-dynamic.md"), "utf8");
if (!/이번 응답/.test(chatDynamic) || !/\{\{conversationContext\}\}/.test(chatDynamic)) {
  fail("chat-dynamic.md should be Langfuse template with conversationContext");
} else {
  ok("chat-dynamic.md is Langfuse-editable turn guide (item 5·6)");
}

const feedbackPrompt = readFileSync(join(root, "prompts/feedback-prompt.md"), "utf8");
if (!/훈련 초점|루브릭/.test(feedbackPrompt)) {
  fail("feedback-prompt.md should be goal-first");
} else {
  ok("feedback-prompt.md is goal-first (item 7 base)");
}

for (const goal of FEEDBACK_RUBRIC_GOALS) {
  const rubricPath = join(root, "prompts/langfuse/feedback-rubric", `${goal}.md`);
  if (!existsSync(rubricPath)) fail(`missing feedback rubric: ${goal}`);
  else ok(`feedback rubric file: ${goal}`);
}

for (const persona of personas) {
  const template = persona.roleplayTemplate || {};
  const missing = REQUIRED_TEMPLATE_KEYS.filter((key) => !template[key]);
  if (missing.length) {
    fail(`${persona.id}: missing roleplayTemplate keys: ${missing.join(", ")}`);
    continue;
  }
  const anchors = template.experienceAnchors || [];
  const rules = template.interpretationRules || [];
  const bank = template.speechFingerprint?.concreteWordBank || [];
  if (!anchors.length) fail(`${persona.id}: experienceAnchors empty`);
  if (!rules.length) fail(`${persona.id}: interpretationRules empty`);
  if (!bank.length) fail(`${persona.id}: concreteWordBank empty`);
  if (!failed) ok(`${persona.id} (${persona.name}): detailed persona fields present`);
}

const serverSource = readFileSync(join(root, "server.js"), "utf8");
if (!/CHAT_USER_TURN_LIMIT\s*=\s*500/.test(serverSource)) {
  fail("server.js should define CHAT_USER_TURN_LIMIT = 500");
} else {
  ok("chat user turn limit is 500");
}

if (!/promptRegistry\.get\("roleplay\/chat-dynamic"/.test(serverSource)) {
  fail("server.js should fetch roleplay/chat-dynamic from Langfuse registry");
} else {
  ok("chat-dynamic fetched via Langfuse registry");
}

if (!/feedbackRubricPromptName/.test(serverSource) || /feedbackGoalRubrics/.test(serverSource)) {
  fail("server.js should use Langfuse feedback rubrics, not hardcoded feedbackGoalRubrics");
} else {
  ok("feedback rubrics loaded from Langfuse catalog (item 7)");
}

if (!/SOLOMON LAB/.test(readFileSync(join(root, "src/lib/constants.js"), "utf8"))) {
  fail("constants.js should use SOLOMON LAB branding");
} else {
  ok("SOLOMON LAB branding in constants");
}

console.log(`\n${failed ? `${failed} check(s) failed` : "All prompt-stack checks passed"}.`);
console.log(
  failed === 0
    ? "Next: npm run langfuse:seed (with LANGFUSE_* keys) then set LANGFUSE_PROMPT_LABEL=staging on Render to edit 5·6·7 in Langfuse UI."
    : ""
);
process.exit(failed ? 1 : 0);
