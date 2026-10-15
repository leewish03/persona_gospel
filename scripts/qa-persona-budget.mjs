import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { detectUserMove, selectPasEntries, personaAdvisory } from "../lib/persona-advisory.js";
import { formatConversationContext } from "../lib/roleplay-context.js";

// Importing server.js starts HTTP and storage; evaluate only its declaration-only prompt section.
export function promptBuilder(source) {
  const start = source.indexOf("const relationshipLabels =");
  const end = source.indexOf("async function handleGoogleAuth(");
  assert.ok(start >= 0 && end > start, "Prompt section boundaries changed; review this harness.");
  return runInNewContext(`${source.slice(start, end)}\nroleplayPromptPartsFor`, { formatConversationContext, detectUserMove, selectPasEntries, personaAdvisory }, { timeout: 1000 });
}

async function main() {
const source = await readFile(new URL("../server.js", import.meta.url), "utf8");
const current = promptBuilder(source);
const baseline = promptBuilder(execFileSync("git", ["show", "f98a88a:server.js"], { encoding: "utf8" }));
const personas = JSON.parse(await readFile(new URL("../data/personas.json", import.meta.url), "utf8"));
const rows = [];
for (const persona of personas) {
  const session = { personaId: persona.id, relationship: "casual_friend", setting: "cafe_catchup", goal: "listen_and_understand" };
  for (const turns of [0, 6, 15]) {
    const messages = Array.from({ length: turns * 2 }, (_, index) => ({
      role: index % 2 ? "user" : "assistant",
      content: index % 2 ? "내가 너무 빨리 조언한 것 같아. 지금 제일 마음에 걸리는 건 뭐야?" : "요즘 결과를 기다리는 게 신경 쓰여. 친구 앞에서는 괜찮은 척했어."
    }));
    const options = { initial: turns === 0 };
    const before = baseline(session, persona, messages, options);
    const after = current(session, persona, messages, options);
    assert.ok(after.input.includes(persona.name));
    assert.ok(after.input.includes(persona.roleplayTemplate.lateSessionTension.coreQuestion));
    assert.ok(after.input.includes("카페"));
    if (turns) {
      assert.ok(after.input.includes(messages.at(-1).content));
      assert.ok(after.dynamicInput.includes(formatConversationContext(messages)));
      assert.equal(after.input, [...after.staticSystemBlocks, after.dynamicInput].join("\n\n"));
      assert.deepEqual([...after.staticSystemBlocks], [...current(session, persona, [], { initial: true }).staticSystemBlocks]);
    }
    rows.push({ persona: persona.id, turns, beforeChars: before.input.length, afterChars: after.input.length, reductionPercent: Number(((1 - after.input.length / before.input.length) * 100).toFixed(1)) });
  }
}
console.log(JSON.stringify({ measurement: "Prompt characters, not billed tokens or model-quality evidence", rows }, null, 2));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/qa-persona-budget.mjs")) await main();
