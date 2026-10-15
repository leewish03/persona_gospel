import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import vm from "node:vm";
import { normalizeUsage, openAiInputCost } from "./openai-usage.js";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
function declaration(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/^(?:(?:async )?function |const |let )/m);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

async function fixture(t) {
  const db = { usageEvents: [], conversations: [], settings: { limits: { dailyStarts: 0, dailyChatMessages: 0, dailyFeedbacks: 0, monthlyGlobalBudgetKrw: 50000 } } };
  const saved = [];
  const requests = [];
  let response = { status: "completed", output_text: "Synthetic answer", usage: { input_tokens: 100, output_tokens: 10 } };
  let providerStatus = 200;
  let release;
  let arrived;
  let held = null;
  const provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    arrived?.();
    if (held) await held;
    res.writeHead(providerStatus, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  const ctx = vm.createContext({
    Buffer, AbortSignal, randomUUID, console: { error() {} }, normalizeUsage, openAiInputCost,
    db, usageLedgerAvailable: true, supabaseUrl: "", supabaseServiceRoleKey: "", dbPath: "fixture",
    writeFile: async (_path, data) => { saved.push(JSON.parse(data)); },
    fetch: (_url, options) => fetch(`http://127.0.0.1:${provider.address().port}`, options),
    currentUsdToKrw: () => 2000,
    sanitizeSettings: value => value,
    modelSettingsFor: () => ({ provider: "openai", model: "gpt-6.1-sol", maxOutputTokens: 100, reasoningEffort: "low" }),
    assertProviderKey: () => "fixture",
    traceModelCall: ({ run }) => run(),
    buildPersonaTraceContext: ({ eventType, userId, conversationId }) => ({ name: `persona-gospel/${eventType}`, userId, sessionId: conversationId }),
    handleAppApi: async () => false,
    readJson: async req => { const chunks = []; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString()); },
    requireCompleteProfile: req => ({ id: req.headers["x-fixture-user"] || "user" }),
    getPersona: () => ({ id: "fixture" }),
    visibleSceneFor: () => "Synthetic scene",
    personaSystemPrompt: async () => ({ text: "Fixed roleplay instructions" }),
    roleplayPromptPartsFor: (_session, _persona, messages) => ({ input: "persona\n\n" + JSON.stringify(messages), staticSystemBlocks: ["persona"], dynamicInput: JSON.stringify(messages) }),
    createConversation: data => { const c = { ...data, id: randomUUID(), status: "active" }; db.conversations.push(c); return c; },
    findConversationForUser: (user, id) => db.conversations.find(c => c.id === id && c.userId === user.id),
    json: (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); },
    saveDb: async () => { saved.push(structuredClone(db)); },
    recordAppLog: async () => {},
    publicServerError: () => ({ error: "Fixture generation failed" }),
    conversationMutations: new Set(), userModelRequests: new Set(),
    feedbackInputFor: (_s, _p, messages) => JSON.stringify(messages),
    feedbackSystemPrompt: async () => ({ text: "Fixed feedback instructions" }),
    feedbackStructureReport: () => ({ needsRepair: false }),
    feedbackClaims: () => [], buildFeedbackSessionBlock: () => "session",
    feedbackSemanticInstructions: "Fixed verifier instructions",
    feedbackSemanticReport: () => ({ verdict: "pass" }),
    summarizeFeedback: text => text,
    estimateTokens: text => String(text).length,
  });
  for (const name of ["koreanDateKey", "isSameDay", "activeLimits", "countUserUsageToday", "monthlyGlobalCostKrw", "usageLimitResponse", "checkUsageLimit", "publicUsageLimits", "contextCapacityError", "assertModelCapacity", "openAiPricePerMtok", "estimateCost", "modelBudgetError", "reserveModelUsage", "persistModelUsage", "callModelWithUsage", "callOpenAIWithUsage", "extractText", "incompleteResponseError", "isMaxOutputIncomplete", "estimateUsage", "recordUsageEvent", "normalizeGeneratedText", "generateFeedbackWithQualityGate", "handleApi"]) vm.runInContext(declaration(name), ctx);
  const api = createServer((req, res) => ctx.handleApi(req, res, new URL(req.url, "http://fixture")));
  await new Promise(resolve => api.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    release?.();
    await Promise.all([api, provider].map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })));
  });
  return {
    ctx, db, saved, requests,
    async post(path, body = {}, user = "user") {
      const result = await fetch(`http://127.0.0.1:${api.address().port}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fixture-user": user }, body: JSON.stringify(body) });
      return { status: result.status, body: await result.json() };
    },
    hold() { held = new Promise(resolve => { release = resolve; }); return new Promise(resolve => { arrived = resolve; }); },
    release() { held = null; release?.(); },
    response(value, status = 200) { response = value; providerStatus = status; },
    conversation(turns = 1) { const c = { id: randomUUID(), userId: "user", session: {}, status: "active", messages: Array.from({ length: turns * 2 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `Synthetic ${i}` })) }; db.conversations.push(c); return c; },
  };
}

test("HTTP start rejects a request whose upper bound crosses the monthly limit before provider dispatch", async t => {
  const f = await fixture(t);
  f.db.settings.limits.monthlyGlobalBudgetKrw = 1;
  const result = await f.post("/api/start");
  assert.equal(result.status, 429);
  assert.equal(result.body.code, "USAGE_LIMIT_REACHED");
  assert.equal(f.requests.length, 0);
  assert.equal(f.db.usageEvents.length, 0);
});

test("HTTP concurrent requests cannot spend the same monthly remainder or same daily slot", async t => {
  const f = await fixture(t);
  f.db.settings.limits.dailyStarts = 1;
  const arrived = f.hold();
  const first = f.post("/api/start");
  await arrived;
  assert.equal(f.saved[0].usageEvents.length, 1, "reservation persisted before provider");
  assert.equal((await f.post("/api/start")).status, 409);
  const reserved = f.db.usageEvents[0].estimatedCostKrw;
  f.db.settings.limits.monthlyGlobalBudgetKrw = reserved * 1.6;
  assert.equal((await f.post("/api/start", {}, "another-user")).status, 429);
  assert.equal(f.requests.length, 1);
  f.release();
  assert.equal((await first).status, 200);
  assert.equal(f.db.usageEvents.length, 1, "settlement must not double count");
  assert.equal(f.db.usageEvents[0].estimatedCostUsd, .0003);
  assert.ok(f.db.usageEvents[0].conversationId);
  assert.equal((await f.post("/api/start")).status, 429);
});

test("HTTP unknown provider failures retain a durable upper bound and block subsequent spend", async t => {
  const f = await fixture(t);
  f.response({ error: { message: "synthetic interruption" } }, 503);
  assert.equal((await f.post("/api/start")).status, 500);
  assert.equal(f.db.usageEvents.length, 1);
  const reserved = f.db.usageEvents[0].estimatedCostKrw;
  assert.ok(reserved > 0);
  assert.equal(f.saved.at(-1).usageEvents[0].estimatedCostKrw, reserved);
  f.db.settings.limits.monthlyGlobalBudgetKrw = reserved + .01;
  assert.equal((await f.post("/api/start")).status, 429);
  assert.equal(f.requests.length, 1);
});

test("HTTP feedback remains available after the daily chat cap and at the 90 percent new-start stop", async t => {
  const f = await fixture(t);
  const c = f.conversation(30);
  f.db.settings.limits.dailyChatMessages = 1;
  f.db.settings.limits.monthlyGlobalBudgetKrw = 1000;
  f.db.usageEvents.push({ userId: "user", eventType: "chat_message", estimatedCostUsd: .451, createdAt: new Date().toISOString() });
  assert.equal((await f.post("/api/start")).status, 429);
  assert.equal((await f.post("/api/chat", { conversationId: c.id, messages: [...c.messages, { role: "user", content: "next" }] })).status, 429);
  const result = await f.post("/api/feedback", { conversationId: c.id });
  assert.equal(result.status, 200);
  assert.equal(c.status, "finished");
  assert.equal(c.messages.length, 60);
  assert.equal(f.requests.length, 2, "draft and semantic verifier");
  assert.equal(f.db.usageEvents.filter(e => e.eventType === "feedback").length, 1);
  for (const request of f.requests) {
    assert.equal(request.prompt_cache_options.mode, "explicit");
    assert.ok(!request.input[0].content[0].text.includes("Synthetic"));
    for (const message of c.messages) assert.ok(request.input[1].content.includes(message.content));
    assert.equal(request.max_output_tokens, 100);
    assert.equal(request.reasoning.effort, "low");
  }
});

test("Korean midnight resets daily usage independently of the host timezone", async t => {
  const { ctx } = await fixture(t);
  assert.equal(ctx.isSameDay("2026-10-15T14:59:59Z", new Date("2026-10-15T15:00:00Z")), false);
  assert.equal(ctx.isSameDay("2026-10-15T15:00:00Z", new Date("2026-10-15T15:00:01Z")), true);
});

test("upper-bound reservations price Sol cache writes at the long-context tier", async t => {
  const f = await fixture(t);
  const event = f.ctx.reserveModelUsage({ settings: { provider: "openai", model: "gpt-6.1-sol", maxOutputTokens: 4096 }, modelType: "feedback", instructions: "fixed", input: "x".repeat(273000), staticSystemBlocks: [], dynamicInput: "" });
  assert.ok(event.inputTokens > 273000);
  assert.equal(event.estimatedCostUsd, Number((event.inputTokens * 5 / 1e6 + 4096 * 15 / 1e6).toFixed(6)));
});

test("HTTP unavailable startup ledger fails closed without a model call", async t => {
  const f = await fixture(t);
  f.ctx.usageLedgerAvailable = false;
  assert.equal((await f.post("/api/start")).status, 503);
  assert.equal(f.requests.length, 0);
});


test("HTTP unlimited personal settings allow starts beyond former daily quota and chat beyond 500 turns", async t => {
  const f = await fixture(t);
  for (let i = 0; i < 4; i++) assert.equal((await f.post("/api/start")).status, 200);
  const c = f.conversation(500);
  const before = JSON.stringify(c.messages);
  const result = await f.post("/api/chat", { conversationId: c.id, message: { role: "user", content: "Another synthetic message" }, expectedMessageCount: c.messages.length });
  assert.equal(result.status, 200);
  assert.equal(result.body.limits.dailyChatMessages.limit, 0);
  assert.equal(c.messages.length, 1002);
  assert.equal(JSON.stringify(c.messages.slice(0, 1000)), before);
  for (const message of c.messages.slice(0, -1)) assert.ok(f.requests.at(-1).input[1].content.includes(message.content));
});

test("HTTP failed reservation persistence never dispatches or triggers a feedback repair", async t => {
  const f = await fixture(t);
  const c = f.conversation();
  f.ctx.supabaseUrl = "fixture";
  f.ctx.supabaseServiceRoleKey = "fixture";
  f.ctx.supabaseRequest = async () => { throw new Error("Synthetic storage outage"); };
  assert.equal((await f.post("/api/feedback", { conversationId: c.id })).status, 502);
  assert.equal(f.requests.length, 0);
  assert.equal(f.db.usageEvents.length, 1, "one conservative reservation, no repair or duplicate charge");
  assert.equal(c.status, "active");
  assert.equal(c.messages.length, 2);
});

test("usage loading paginates beyond PostgREST and former 5000-row limits", async t => {
  const { ctx } = await fixture(t);
  const offsets = [];
  ctx.supabaseRequest = async path => {
    const offset = Number(new URL(path, "http://fixture").searchParams.get("offset"));
    offsets.push(offset);
    return Array.from({ length: offset < 6000 ? 1000 : 17 }, (_, i) => ({ id: offset + i }));
  };
  vm.runInContext(declaration("loadUsageEvents"), ctx);
  const rows = await ctx.loadUsageEvents();
  assert.equal(rows.length, 6017);
  assert.deepEqual(offsets, [0, 1000, 2000, 3000, 4000, 5000, 6000]);
  assert.equal(new Set(rows.map(row => row.id)).size, 6017);
});


test("HTTP feedback failures account every paid attempt once without an unbounded retry", async t => {
  const f = await fixture(t);
  const c = f.conversation();
  f.response({ error: { message: "synthetic failure" }, usage: { input_tokens: 100, output_tokens: 10 } }, 500);
  assert.equal((await f.post("/api/feedback", { conversationId: c.id })).status, 502);
  assert.equal(f.requests.length, 2);
  assert.equal(f.db.usageEvents.length, 2);
  assert.deepEqual(f.db.usageEvents.map(e => e.eventType).sort(), ["feedback", "feedback_retry"]);
  assert.equal(f.db.usageEvents.reduce((sum, e) => sum + e.estimatedCostUsd, 0), .0006);
  assert.equal(c.status, "active");
});

test("HTTP feedback budget denial is 429 with no paid call, repair, or extra usage row", async t => {
  const f = await fixture(t);
  const c = f.conversation();
  f.db.settings.limits.monthlyGlobalBudgetKrw = 1;
  assert.equal((await f.post("/api/feedback", { conversationId: c.id })).status, 429);
  assert.equal(f.requests.length, 0);
  assert.equal(f.db.usageEvents.length, 0);
  assert.equal(c.status, "active");
});
