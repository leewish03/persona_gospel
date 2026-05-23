#!/usr/bin/env node
/**
 * 코드 범위에서 페르소나·프롬프트 스택이 기대대로 구성됐는지 검증한다.
 * Usage: node scripts/verify-prompt-stack.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const personas = JSON.parse(readFileSync(join(root, "data/personas.json"), "utf8"));

const REQUIRED_TEMPLATE_KEYS = [
  "personalWorld",
  "experienceAnchors",
  "interpretationRules",
  "speechFingerprint"
];

const REQUIRED_PERSONA_FILES = [
  "prompts/persona-system-prompt.md",
  "prompts/feedback-prompt.md"
];

let failed = 0;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failed += 1;
}

function ok(message) {
  console.log(`OK: ${message}`);
}

for (const file of REQUIRED_PERSONA_FILES) {
  const path = join(root, file);
  if (!existsSync(path)) fail(`missing ${file}`);
  else ok(`${file} exists`);
}

const personaPrompt = readFileSync(join(root, "prompts/persona-system-prompt.md"), "utf8");
if (!/personalWorld|speechFingerprint|concreteWordBank/.test(personaPrompt)) {
  fail("persona-system-prompt.md should reference detailed persona card fields");
} else {
  ok("persona-system-prompt.md references detailed persona fields");
}

const feedbackPrompt = readFileSync(join(root, "prompts/feedback-prompt.md"), "utf8");
if (!/훈련 초점/.test(feedbackPrompt) || /무조건/.test(feedbackPrompt)) {
  fail("feedback-prompt.md should prioritize training goal without blanket gospel mandate");
} else if (!/루브릭|1순위/.test(feedbackPrompt)) {
  fail("feedback-prompt.md should mention rubric / primary focus");
} else {
  ok("feedback-prompt.md is goal-first");
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

if (!/feedbackGoalRubrics/.test(serverSource) || !/feedbackRubricBlockFor/.test(serverSource)) {
  fail("server.js should include goal-specific feedback rubrics");
} else {
  ok("feedback goal rubrics wired in server");
}

if (!/SOLOMON LAB/.test(readFileSync(join(root, "src/lib/constants.js"), "utf8"))) {
  fail("constants.js should use SOLOMON LAB branding");
} else {
  ok("SOLOMON LAB branding in constants");
}

if (/Mobile Training/.test(readFileSync(join(root, "src/App.jsx"), "utf8"))) {
  fail("App.jsx should not show Mobile Training badge");
} else {
  ok("Mobile Training badge removed from home");
}

console.log(`\n${failed ? `${failed} check(s) failed` : "All prompt-stack checks passed"}.`);
process.exit(failed ? 1 : 0);
