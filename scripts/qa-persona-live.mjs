import { refuseLegacyPaidQa } from '../lib/qa-budget.js';
refuseLegacyPaidQa();
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { promptBuilder } from "./qa-persona-budget.mjs";

// Paid opt-in: QA_ENV_FILE supplies credentials, QA_LIVE=1 acknowledges real API calls.
assert.equal(process.env.QA_LIVE, "1", "Set QA_LIVE=1 only with an approved API budget.");
assert.ok(process.env.QA_ENV_FILE, "QA_ENV_FILE is required; never pass keys on the command line.");
const config = parseEnv(await readFile(process.env.QA_ENV_FILE, "utf8"));
assert.ok(config.OPENAI_API_KEY, "OpenAI key is missing.");
const model = "gpt-5.4-mini";
const root = new URL("../", import.meta.url);
const out = new URL(".omo/qa/live/", root);
await mkdir(out, { recursive: true });
const ledgerUrl = new URL("budget.json", out);
let ledger;
try { ledger = JSON.parse(await readFile(ledgerUrl, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; ledger = { limitUsd: 4, reservedUsd: 0, billedUsd: 0, calls: [] }; }
// $4 reserved at 2,000 KRW/USD leaves 2,000 KRW of the approved 10,000 for browser QA.
assert.equal(ledger.limitUsd, 4);
const currentSource = await readFile(new URL("server.js", root), "utf8");
const baselineSource = execFileSync("git", ["show", "f98a88a:server.js"], { encoding: "utf8" });
const currentSystem = await readFile(new URL("prompts/persona-system-prompt.md", root), "utf8");
const baselineSystem = execFileSync("git", ["show", "f98a88a:prompts/persona-system-prompt.md"], { encoding: "utf8" });
const personas = JSON.parse(await readFile(new URL("data/personas.json", root), "utf8"));
const variants = [
  { id: "baseline-high", build: promptBuilder(baselineSource), instructions: baselineSystem, effort: "high" },
  { id: "current-high", build: promptBuilder(currentSource), instructions: currentSystem, effort: "high" },
  { id: "current-low", build: promptBuilder(currentSource), instructions: currentSystem, effort: "low" },
  ...(["candidate-low", "final-low"].includes(process.env.QA_VARIANT) ? [{ id: process.env.QA_VARIANT, build: promptBuilder(currentSource), instructions: currentSystem, effort: "low" }] : [])
].filter(v => !process.env.QA_VARIANT || v.id === process.env.QA_VARIANT);
assert.ok(variants.length, "Unknown QA_VARIANT.");
const userMoves = [
  "오늘은 해결책부터 말하지 않고 네 이야기를 듣고 싶어. 지금 제일 마음에 걸리는 건 뭐야?",
  "내가 네 마음을 다 안다고 할 수는 없지만, 그게 꽤 오래 마음에 남았겠다. 내가 놓친 부분이 있어?",
  "잠깐, 내 친구 이름은 민호야. 다음 주 화요일에 만나기로 했어. 너랑 나눈 얘기를 그대로 전하지는 않을게.",
  "내가 보기엔 그냥 믿으면 다 해결돼. 일단 교회부터 나오면 되잖아?",
  "미안해. 너무 쉽게 결론을 냈네. 오늘은 결정하지 않아도 돼. 아까 내가 말한 친구 이름과 만나는 날 기억해?"
];

async function call(variant, persona, input, turn) {
  const payload = { model, instructions: variant.instructions, input, reasoning: { effort: variant.effort }, max_output_tokens: 1400, store: false };
  // UTF-8 bytes bound text token count conservatively; reserve failed/unknown calls too.
  const reserve = (Buffer.byteLength(payload.instructions + input, "utf8") + 1024) * 0.75 / 1e6 + 1400 * 4.5 / 1e6;
  assert.ok(ledger.reservedUsd + reserve <= ledger.limitUsd, "Approved QA budget reservation exhausted.");
  const row = { variant: variant.id, persona: persona.id, turn, reservedUsd: reserve, status: "reserved" };
  ledger.reservedUsd += reserve;
  ledger.calls.push(row);
  await writeFile(ledgerUrl, JSON.stringify(ledger, null, 2));
  const started = performance.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.OPENAI_API_KEY}` },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(90000)
  });
  const data = await response.json();
  row.latencyMs = Math.round(performance.now() - started);
  row.status = response.ok ? data.status : `http-${response.status}`;
  row.usage = data.usage;
  if (data.usage) {
    const cached = data.usage.input_tokens_details?.cached_tokens || 0;
    row.billedUsd = ((data.usage.input_tokens - cached) * 0.75 + cached * 0.075 + data.usage.output_tokens * 4.5) / 1e6;
    ledger.billedUsd += row.billedUsd;
  }
  await writeFile(ledgerUrl, JSON.stringify(ledger, null, 2));
  assert.ok(response.ok, `Model call failed: HTTP ${response.status}; no automatic retry.`);
  const text = (data.output || []).flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("\n").trim();
  return { text, status: row.status, usage: row.usage, latencyMs: row.latencyMs };
}

for (const variant of variants) {
  for (const persona of personas.filter(p => !process.env.QA_PERSONA || p.id === process.env.QA_PERSONA)) {
    const session = { personaId: persona.id, relationship: "casual_friend", setting: "cafe_catchup", goal: "listen_and_understand" };
    const messages = [];
    const results = [];
    for (let turn = 0; turn <= userMoves.length; turn++) {
      if (turn) messages.push({ role: "user", content: userMoves[turn - 1] });
      const prompt = variant.build(session, persona, messages, { initial: turn === 0 });
      const result = await call(variant, persona, prompt.input, turn);
      results.push(result);
      if (result.status !== "completed" || !result.text) break;
      messages.push({ role: "assistant", content: result.text });
    }
    const replies = messages.filter(m => m.role === "assistant");
    const report = {
      variant: variant.id, model, persona: persona.id, sourceHash: createHash("sha256").update(currentSource + currentSystem).digest("hex"),
      syntheticDialogue: true, messages, results,
      checks: {
        completed: results.length === 6 && results.every(r => r.status === "completed" && r.text),
        noInternalLabels: replies.every(m => !/PAS[_ -]?\d|runtimeCard|시스템 프롬프트|이번 턴 적용/.test(m.content)),
        remembersFact: /민호/.test(replies.at(-1)?.content || "") && /화요일/.test(replies.at(-1)?.content || "")
      }
    };
    await writeFile(new URL(`${variant.id}-${persona.id}.json`, out), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ variant: variant.id, persona: persona.id, checks: report.checks, cumulativeUsd: Number(ledger.billedUsd.toFixed(4)), reservedUsd: Number(ledger.reservedUsd.toFixed(4)) }));
  }
}
