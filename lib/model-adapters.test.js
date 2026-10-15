import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { normalizeUsage, openAiInputCost } from "./openai-usage.js";
import { selectPasEntries } from "./persona-advisory.js";
import { promptBuilder } from "../scripts/qa-persona-budget.mjs";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
function declaration(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `Missing ${name}`);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/^(?:async )?function \w+\(/m);
  return next < 0 ? tail : tail.slice(0, next + 1);
}
function harness(data) {
  const requests = [];
  const context = vm.createContext({ AbortSignal, normalizeUsage, openAiInputCost, selectPasEntries, currentUsdToKrw: () => 2000,
    fetch: async (url, options) => { requests.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => data }; }
  });
  for (const name of ["extractText", "extractAnthropicText", "normalizeAnthropicUsage", "incompleteResponseError", "openAiPricePerMtok", "anthropicPricePerMtok", "estimateCost", "callOpenAIWithUsage", "callAnthropicWithUsage"]) vm.runInContext(declaration(name), context);
  return { context, requests };
}
test("explicit no-reasoning survives the OpenAI adapter", async () => {
  const { context, requests } = harness({ status: "completed", output_text: "짧은 답", usage: {} });
  await context.callOpenAIWithUsage({ apiKey: "test", model: "gpt-6-luna", input: "test", reasoningEffort: "none", maxOutputTokens: 768 });
  assert.equal(requests[0].payload.reasoning.effort, "none");
  assert.equal(requests[0].payload.max_output_tokens, 768);
});

test("Sol prices full requests at the context tier including cache writes", () => {
  const { context } = harness({});
  assert.deepEqual(JSON.parse(JSON.stringify(context.openAiPricePerMtok("gpt-6.1-sol", "feedback", 272000))),
    { inputPrice: 2, cachedInputPrice: .1, cacheWritePrice: 2.5, outputPrice: 10 });
  assert.deepEqual(JSON.parse(JSON.stringify(context.openAiPricePerMtok("gpt-6.1-sol", "feedback", 272001))),
    { inputPrice: 4, cachedInputPrice: .2, cacheWritePrice: 5, outputPrice: 15 });
  assert.equal(context.estimateCost({ model: "gpt-6.1-sol", inputTokens: 1000, cacheReadInputTokens: 200, cacheCreationInputTokens: 600, outputTokens: 100 }).estimatedCostUsd, .00292);
  assert.equal(context.estimateCost({ model: "gpt-6.1-sol", inputTokens: 272001, cacheReadInputTokens: 200000, cacheCreationInputTokens: 60000, outputTokens: 100 }).estimatedCostUsd, .389504);
});

test("Sol preserves supported overrides and normalizes unsupported reasoning", async () => {
  const { context, requests } = harness({ status: "completed", output_text: "답", usage: {} });
  for (const name of ["cleanOptionalNumber", "sanitizeModelSettings"]) vm.runInContext(declaration(name), context);
  for (const reasoningEffort of ["low", "medium", "high", "xhigh", "max"]) {
    const settings = context.sanitizeModelSettings({ model: "gpt-6.1-sol", reasoningEffort, maxOutputTokens: 4096 });
    assert.equal(settings.reasoningEffort, reasoningEffort);
    await context.callOpenAIWithUsage({ ...settings, apiKey: "fixture", input: "test", temperature: .7, topP: .9 });
    assert.equal(requests.at(-1).payload.reasoning.effort, reasoningEffort);
    assert.equal(requests.at(-1).payload.max_output_tokens, 4096);
    assert.ok(!("temperature" in requests.at(-1).payload) && !("top_p" in requests.at(-1).payload));
  }
  for (const reasoningEffort of ["none", "minimal", ""]) {
    assert.equal(context.sanitizeModelSettings({ model: "gpt-6.1-sol", reasoningEffort }).reasoningEffort, "low");
  }
  assert.equal(context.sanitizeModelSettings({ model: "gpt-6.1-sol" }, { reasoningEffort: "high" }).reasoningEffort, "high");
  assert.equal(context.sanitizeModelSettings({ model: "gpt-6-luna", reasoningEffort: "none" }).reasoningEffort, "none");
});

test("Sol context capacity is verified before sending the full history", () => {
  const context = vm.createContext({ Buffer, contextCapacityError: () => new Error("capacity") });
  vm.runInContext(declaration("assertModelCapacity"), context);
  const settings = { model: "gpt-6.1-sol", provider: "openai", maxOutputTokens: 4096 };
  assert.equal(context.assertModelCapacity(settings, "system", "history", [], "").limit, 1050000);
  assert.throws(() => context.assertModelCapacity(settings, "system", "a".repeat(1050000), [], ""), /capacity/);
});

test("Sol roleplay caches only the unchanged static prefix and preserves every dialogue turn", async () => {
  const { context, requests } = harness({ status: "completed", output_text: "답", usage: {} });
  Object.assign(context, {
    Buffer,
    modelSettingsFor: () => ({ provider: "openai", model: "gpt-6.1-sol", maxOutputTokens: 1536, reasoningEffort: "low" }),
    reserveModelUsage: () => ({}), persistModelUsage: async () => {},
    assertProviderKey: () => "fixture"
  });
  for (const name of ["assertModelCapacity", "callModelWithUsage"]) vm.runInContext(declaration(name), context);
  const persona = JSON.parse(readFileSync(new URL("../data/personas.json", import.meta.url), "utf8"))[0];
  const session = { personaId: persona.id, relationship: "casual_friend", setting: "cafe_catchup", goal: "listen_and_understand" };
  const messages = Array.from({ length: 24 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `합성 발화 ${i + 1}: "기억"\n줄바꿈 보존` }));
  const build = promptBuilder(source);
  const instructions = "역할극 지침\n공백과 원문 보존 ";
  for (const history of [[], messages, [...messages, { role: "user", content: "마지막 추가 발화" }]]) {
    const prompt = build(session, persona, history, { initial: history.length === 0 });
    await context.callModelWithUsage({ modelType: "chat", instructions, ...prompt, cacheStaticSystem: true });
    const payload = requests.at(-1).payload;
    assert.ok(Array.isArray(payload.input), "Sol roleplay must send an explicit static cache boundary");
    assert.deepEqual(payload.prompt_cache_options, { mode: "explicit" });
    assert.ok(!("instructions" in payload), "instructions must be inside the cacheable developer prefix");
    assert.deepEqual(payload.input, [
      { role: "developer", content: [{ type: "input_text", text: [instructions, ...prompt.staticSystemBlocks].join("\n\n"), prompt_cache_breakpoint: { mode: "explicit" } }] },
      { role: "user", content: prompt.dynamicInput }
    ]);
    assert.equal(payload.input.map(item => typeof item.content === "string" ? item.content : item.content[0].text).join("\n\n"), [instructions, prompt.input].join("\n\n"));
    for (const message of history) assert.ok(payload.input[1].content.includes(JSON.stringify(message.content)));
    assert.equal(payload.max_output_tokens, 1536);
    assert.equal(payload.reasoning.effort, "low");
    assert.equal(payload.store, false);
  }
  assert.deepEqual(requests[1].payload.input[0], requests[2].payload.input[0]);
  assert.notEqual(requests[1].payload.input[1].content, requests[2].payload.input[1].content);

  const prompt = build(session, persona, messages);
  for (const options of [
    { overrides: { model: "gpt-6-luna" }, cacheStaticSystem: true },
    { overrides: { model: "gpt-5.4-mini" }, cacheStaticSystem: true },
    { cacheStaticSystem: false },
    { cacheStaticSystem: true, dynamicInput: "" }
  ]) {
    await context.callModelWithUsage({ modelType: "chat", instructions, ...prompt, ...options });
    const payload = requests.at(-1).payload;
    assert.equal(payload.instructions, instructions);
    assert.equal(payload.input, prompt.input);
    assert.ok(!("prompt_cache_options" in payload));
    assert.ok(!JSON.stringify(payload).includes("prompt_cache_breakpoint"));
  }
});

test("Haiku 5.5 omits unsupported sampling and maps legacy thinking budget to adaptive", async () => {
  const { context, requests } = harness({ content: [{ type: "text", text: "답" }], stop_reason: "end_turn", usage: {} });
  await context.callAnthropicWithUsage({ apiKey: "test", model: "claude-haiku-5-5", input: "test", thinkingType: "enabled", thinkingBudgetTokens: 8192, reasoningEffort: "low", temperature: .7, topP: .9, maxOutputTokens: 768 });
  const p = requests[0].payload;
  assert.equal(p.thinking.type, "adaptive");
  assert.equal(p.output_config.effort, "low");
  assert.equal(p.max_tokens, 768);
  assert.ok(!("temperature" in p) && !("top_p" in p));
});
test("Haiku disabled thinking is explicit and exhaustion never doubles paid calls", async () => {
  const { context, requests } = harness({ content: [], stop_reason: "max_tokens", usage: { output_tokens: 768 } });
  await assert.rejects(context.callAnthropicWithUsage({ apiKey: "test", model: "claude-haiku-5-5", input: "test", thinkingType: "adaptive" }));
  assert.equal(requests.length, 1);
  const disabled = harness({ content: [{ type: "text", text: "답" }], stop_reason: "end_turn", usage: {} });
  await disabled.context.callAnthropicWithUsage({ apiKey: "test", model: "claude-haiku-5-5", input: "test", thinkingType: "disabled" });
  assert.equal(disabled.requests[0].payload.thinking.type, "disabled");
});
test("cache writes are input subsets and latest model context thresholds price the full request", () => {
  assert.equal(normalizeUsage({ input_tokens_details: { cache_write_tokens: 600 } }).cacheCreationInputTokens, 600);
  assert.equal(openAiInputCost(1000, 200, .1, .01, 600, .125), .000097);
  const { context } = harness({});
  assert.equal(context.openAiPricePerMtok("gpt-6-luna", "chat", 272000).outputPrice, .5);
  assert.equal(context.openAiPricePerMtok("gpt-6-luna", "chat", 272001).outputPrice, .75);
  assert.equal(context.anthropicPricePerMtok("claude-haiku-5-5", "chat", 100000).inputPrice, .1);
  assert.equal(context.anthropicPricePerMtok("claude-haiku-5-5", "chat", 100001).inputPrice, .5);
  assert.equal(context.estimateCost({ model: "gpt-6-luna", inputTokens: 1000, cacheReadInputTokens: 200, cacheCreationInputTokens: 600, outputTokens: 100 }).estimatedCostUsd, .000147);
});

test("long dialogue does not demand repeated location props", () => {
  const persona = JSON.parse(readFileSync(new URL("../data/personas.json", import.meta.url), "utf8"))[0];
  const messages = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "앞의 이야기를 듣고 있어." }));
  const prompt = promptBuilder(source)({ personaId: persona.id, relationship: "casual_friend", setting: "cafe_catchup", goal: "listen_and_understand" }, persona, messages);
  assert.ok(!prompt.dynamicInput.includes("이번 턴에 카페, 커피"));
  assert.match(prompt.dynamicInput, /장소 언급이 없어도 상황이 사라진 것은 아니다/);
});

test("ordinary questions do not choose gospel fallback actions", () => {
  const { context } = harness({});
  const pasMap = ["question", "faith_salvation", "god_love", "listening", "empathy"].map(userMove => ({ userMove }));
  const selected = context.selectPasEntries({ roleplayTemplate: { pasMap } }, { userMove: "question" }, 3);
  assert.equal(selected.map(p => p.userMove).join(","), "question,listening,empathy");
});

test("incomplete provider errors retain raw usage for feedback retry accounting", async () => {
  const raw = { input_tokens: 41, output_tokens: 23 };
  const openai = harness({ status: "incomplete", incomplete_details: {reason:"max_output_tokens"}, usage: raw });
  await assert.rejects(openai.context.callOpenAIWithUsage({apiKey:"fixture",model:"gpt-6-luna",input:"synthetic"}), error => {
    assert.equal(error.usage.inputTokens, 41);
    assert.equal(error.usage.outputTokens, 23);
    assert.equal(JSON.stringify(error.rawUsage), JSON.stringify(raw));
    return true;
  });
  const anthropic = harness({content:[],stop_reason:"max_tokens",usage:raw});
  await assert.rejects(anthropic.context.callAnthropicWithUsage({apiKey:"fixture",model:"claude-haiku-5-5",input:"synthetic"}), error => {
    assert.equal(error.code,"MODEL_RESPONSE_INCOMPLETE");
    assert.equal(error.usage.inputTokens,41);
    assert.equal(error.usage.outputTokens,23);
    assert.equal(JSON.stringify(error.rawUsage),JSON.stringify(raw));
    return true;
  });
  assert.equal(anthropic.requests.length,1);
});


test("saved Anthropic override never hides an empty-response retry", async () => {
  const {context,requests}=harness({content:[],stop_reason:"end_turn",usage:{input_tokens:41,output_tokens:23}});
  await assert.rejects(context.callAnthropicWithUsage({apiKey:"fixture",model:"claude-sonnet-4-5",input:"synthetic",thinkingType:"enabled"}), error => {
    assert.equal(error.providerAttempted,true);
    assert.equal(error.usage.outputTokens,23);
    return true;
  });
  assert.equal(requests.length,1);
});


test("Sol feedback and verifier cache only fixed instructions, preserving the full dynamic input", async () => {
  const { context, requests } = harness({ status: "completed", output_text: "답", usage: {} });
  const instructions = "고정 평가 지침\n".repeat(1200);
  for (const input of ["정본 전체 대화\n첫 발화부터 마지막까지", "정본 전체 대화\n검증할 초안\n모든 주장"]) {
    await context.callOpenAIWithUsage({ apiKey: "fixture", model: "gpt-6.1-sol", instructions, input, dynamicInput: input, cacheStaticSystem: true, maxOutputTokens: 4096, reasoningEffort: "low" });
    const p = requests.at(-1).payload;
    assert.equal(p.input[0].content[0].text, instructions);
    assert.equal(p.input[1].content, input);
    assert.equal(p.max_output_tokens, 4096);
    assert.equal(p.reasoning.effort, "low");
    assert.equal(p.input.map(item => typeof item.content === "string" ? item.content : item.content[0].text).join("\n\n"), [instructions, input].join("\n\n"));
  }
  for (const model of ["gpt-6-luna", "gpt-5.4-mini"]) {
    await context.callOpenAIWithUsage({ apiKey: "fixture", model, instructions, input: "all dialogue", dynamicInput: "all dialogue", cacheStaticSystem: true });
    assert.equal(requests.at(-1).payload.instructions, instructions);
    assert.equal(requests.at(-1).payload.input, "all dialogue");
    assert.equal(requests.at(-1).payload.prompt_cache_options, undefined);
  }
});
