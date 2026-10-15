import { refuseLegacyPaidQa } from '../lib/qa-budget.js';
refuseLegacyPaidQa();
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { promptBuilder } from "./qa-persona-budget.mjs";

assert.equal(process.env.QA_LIVE, "1", "Paid evaluation requires QA_LIVE=1.");
assert.ok(process.env.QA_ENV_FILE, "Supply a local credential file, never inline keys.");
const root = new URL("../", import.meta.url);
const config = parseEnv(await readFile(process.env.QA_ENV_FILE, "utf8"));
const source = await readFile(new URL("server.js", root), "utf8");
const instructions = await readFile(new URL("prompts/persona-system-prompt.md", root), "utf8");
const build = promptBuilder(source);
const personas = JSON.parse(await readFile(new URL("data/personas.json", root), "utf8"));
const out = new URL(".omo/qa/models/", root);
await mkdir(out, { recursive: true });
const ledgerUrl = new URL("budget.json", out);
let ledger;
try { ledger = JSON.parse(await readFile(ledgerUrl, "utf8")); }
catch (e) { if (e.code !== "ENOENT") throw e; ledger = { reservedUsd: 0, billedUsd: 0, calls: [] }; }
const priorLedgers = [".omo/qa/live/budget.json", ".omo/qa/browser-budget.json"];
async function reserve(row) {
  // Preserve every earlier reservation, including failed or unknown calls, across this approval window.
  const prior = await Promise.all(priorLedgers.map(async f => JSON.parse(await readFile(new URL(f, root), "utf8"))));
  const total = prior.reduce((sum, l) => sum + l.reservedUsd, ledger.reservedUsd + row.reservedUsd);
  assert.ok(Number.isFinite(total) && total <= 5, "10,000 KRW cap exceeded at conservative 2,000 KRW/USD.");
  ledger.reservedUsd += row.reservedUsd;
  ledger.calls.push(row);
  await writeFile(ledgerUrl, JSON.stringify(ledger, null, 2));
}
const variants = [
  { id: "mini-low", model: "gpt-5.4-mini", provider: "openai", effort: "low", inputPrice: .75, outputPrice: 4.5 },
  { id: "luna-none", model: "gpt-6-luna", provider: "openai", effort: "none", inputPrice: .1, outputPrice: .5 },
  { id: "luna-low", model: "gpt-6-luna", provider: "openai", effort: "low", inputPrice: .1, outputPrice: .5 },
  { id: "luna-final", model: "gpt-6-luna", provider: "openai", effort: "low", inputPrice: .1, outputPrice: .5 },
  { id: "luna-release", model: "gpt-6-luna", provider: "openai", effort: "low", inputPrice: .1, outputPrice: .5 },
  { id: "haiku-low", model: "claude-haiku-5-5", provider: "anthropic", effort: "low", inputPrice: .1, outputPrice: .5 }
].filter(v => !process.env.QA_VARIANT || v.id === process.env.QA_VARIANT);
assert.ok(variants.length, "Unknown variant.");
// Reconcile estimates from retained raw usage after adding the provider's cache-write field.
for (const row of ledger.calls.filter(r => r.usage)) {
  const u = row.usage;
  const anthropic = row.variant.startsWith("haiku-");
  const inputPrice = row.variant.startsWith("mini-") ? .75 : .1;
  const outputPrice = row.variant.startsWith("mini-") ? 4.5 : .5;
  const cached = anthropic ? u.cache_read_input_tokens || 0 : u.input_tokens_details?.cached_tokens || 0;
  const created = anthropic ? u.cache_creation_input_tokens || 0 : u.input_tokens_details?.cache_write_tokens || 0;
  const corrected = ((u.input_tokens - (anthropic ? 0 : cached + created)) * inputPrice + cached * inputPrice * .1 + created * inputPrice * 1.25 + u.output_tokens * outputPrice) / 1e6;
  if (row.billedUsd !== corrected) row.previousEstimateUsd ??= row.billedUsd;
  row.billedUsd = corrected;
}
ledger.billedUsd = ledger.calls.reduce((sum, row) => sum + (row.billedUsd || 0), 0);
await writeFile(ledgerUrl, JSON.stringify(ledger, null, 2));
const moves = [
  "오늘은 네 얘기를 좀 듣고 싶어. 요즘 뭐가 가장 신경 쓰여?",
  "내가 다 이해한다고 할 수는 없지만 쉽게 넘길 일은 아니겠다. 더 말하고 싶은 게 있어?",
  "참 내 친구 민호를 다음 주 화요일에 만나. 네 이야기는 옮기지 않을게.",
  "그냥 믿으면 다 해결돼. 이번 주부터 무조건 교회 나와.",
  "미안해. 내가 성급했어. 거절해도 괜찮아. 아까 내 친구 이름이랑 만나는 날 기억해?",
  "내게 복음은 잘해야 인정받는다는 압박과는 달라. 하나님이 먼저 사랑하셨고 예수님이 우리를 위해 죽고 부활하셨다는 이야기야. 이 말에서 가장 이해 안 되는 부분이 있어?"
];
for (const variant of variants) {
  assert.ok(config[variant.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"], "Provider key missing.");
  for (const persona of personas.filter(p => !process.env.QA_PERSONA || p.id === process.env.QA_PERSONA)) {
    const reportUrl = new URL(`${variant.id}-${persona.id}.json`, out);
    // A rerun must not silently overwrite evidence or spend twice.
    try { await readFile(reportUrl); console.log(`skip existing ${variant.id}/${persona.id}`); continue; }
    catch (e) { if (e.code !== "ENOENT") throw e; }
    const messages = [], results = [];
    const session = { personaId: persona.id, relationship: "casual_friend", setting: "cafe_catchup", goal: "listen_and_understand" };
    for (const [turn, content] of moves.entries()) {
      messages.push({ role: "user", content });
      const prompt = build(session, persona, messages);
      const cap = 768;
      const anthropic = variant.provider === "anthropic";
      const system = anthropic ? [instructions, ...prompt.staticSystemBlocks].join("\n\n") : instructions;
      const input = anthropic ? prompt.dynamicInput : prompt.input;
      const payload = anthropic
        ? { model: variant.model, system, messages: [{ role: "user", content: input }], max_tokens: cap, thinking: { type: "adaptive" }, output_config: { effort: variant.effort } }
        : { model: variant.model, instructions: system, input, reasoning: { effort: variant.effort }, max_output_tokens: cap, store: false };
      const row = { variant: variant.id, persona: persona.id, turn, status: "reserved", reservedUsd: ((Buffer.byteLength(system + input) + 1024) * variant.inputPrice * 1.25 + cap * variant.outputPrice) / 1e6 };
      await reserve(row);
      const start = performance.now();
      const response = await fetch(anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/responses", {
        method: "POST", signal: AbortSignal.timeout(60000),
        headers: anthropic ? { "Content-Type": "application/json", "x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" } : { "Content-Type": "application/json", Authorization: `Bearer ${config.OPENAI_API_KEY}` },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      row.latencyMs = Math.round(performance.now() - start);
      row.status = response.ok ? (anthropic ? data.stop_reason : data.status) : `http-${response.status}`;
      row.usage = data.usage;
      if (data.usage) {
        const u = data.usage;
        const cached = anthropic ? u.cache_read_input_tokens || 0 : u.input_tokens_details?.cached_tokens || 0;
        const created = anthropic ? u.cache_creation_input_tokens || 0 : u.input_tokens_details?.cache_write_tokens || 0;
        row.billedUsd = ((u.input_tokens - (anthropic ? 0 : cached + created)) * variant.inputPrice + cached * variant.inputPrice * .1 + created * variant.inputPrice * 1.25 + u.output_tokens * variant.outputPrice) / 1e6;
        row.uncachedUsd = ((u.input_tokens + (anthropic ? cached + created : 0)) * variant.inputPrice + u.output_tokens * variant.outputPrice) / 1e6;
        ledger.billedUsd += row.billedUsd;
      }
      await writeFile(ledgerUrl, JSON.stringify(ledger, null, 2));
      assert.ok(response.ok, `HTTP ${response.status}; ${data.error?.type || "unknown"}; no retry.`);
      const text = anthropic ? data.content.filter(b => b.type === "text").map(b => b.text).join("\n") : (data.output || []).flatMap(b => b.content || []).filter(b => b.type === "output_text").map(b => b.text).join("\n");
      results.push({ ...row, text });
      messages.push({ role: "assistant", content: text });
    }
    const checks = {
      complete: results.every(r => ["completed", "end_turn"].includes(r.status) && r.text),
      concise: results.every(r => r.text.length <= 200),
      remembers: /민호/.test(results[4].text) && /화요일/.test(results[4].text),
      noLabels: results.every(r => !/PAS[_ -]?\d|runtimeCard|시스템 프롬프트|이번 턴 적용|사용자|^.{2,8}:/.test(r.text))
    };
    await writeFile(reportUrl, JSON.stringify({ variant, persona: persona.id, sourceHash: createHash("sha256").update(source + instructions).digest("hex"), syntheticDialogue: true, messages, results, checks }, null, 2));
    console.log(JSON.stringify({ variant: variant.id, persona: persona.id, checks, billedUsd: ledger.billedUsd, reservedUsd: ledger.reservedUsd }));
  }
}
