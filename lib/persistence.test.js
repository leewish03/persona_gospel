import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import vm from "node:vm";

const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
function declaration(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, `Missing ${name}`);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/^(?:(?:async )?function |const |let )/m);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

async function fixture(t) {
  const conversationId = randomUUID();
  const opening = { id: randomUUID(), conversation_id: conversationId, role: "assistant", content: "Synthetic opening", sort_order: 0, created_at: "2026-10-15T00:00:00.000Z" };
  const rows = new Map([[opening.id, opening]]);
  const requests = [];
  let failure = "";
  let disk;
  const conversation = { id: conversationId, user_id: randomUUID(), persona_id: "fixture", created_at: opening.created_at };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const table = url.pathname.split("/").at(-1);
    const body = [];
    for await (const chunk of req) body.push(chunk);
    const payload = body.length ? JSON.parse(Buffer.concat(body).toString()) : null;
    requests.push({ method: req.method, table, query: url.search, payload });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(JSON.stringify(table === "conversation_messages" ? [...rows.values()] : table === "conversations" ? [conversation] : []));
      return;
    }
    if (table === "conversation_messages") {
      if (req.method === "DELETE") {
        for (const [id, row] of rows) if (`eq.${row.conversation_id}` === url.searchParams.get("conversation_id")) rows.delete(id);
      }
      if (req.method === "POST") {
        if (failure !== "before") for (const row of payload) rows.set(row.id, row);
        if (failure) {
          res.writeHead(503);
          res.end(JSON.stringify({ message: "Injected interrupted save" }));
          return;
        }
      }
    }
    res.end("[]");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const context = vm.createContext({
    AbortSignal, fetch, randomUUID, structuredClone,
    supabaseUrl: `http://127.0.0.1:${server.address().port}`, supabaseServiceRoleKey: "synthetic-key",
    defaultSettings: {}, mergeSettings: (a, b) => ({ ...a, ...b }), summarizeFeedback: () => "",
    dbPath: "synthetic-memory-only", writeFile: async (_path, content) => { disk = JSON.parse(content); },
    console: { error: () => {} }
  });
  for (const name of ["supabaseRequest", "supabaseUserToApp", "appUserToSupabase", "supabaseConversationToApp", "appConversationToSupabase", "supabaseUsageToApp", "appUsageToSupabase", "supabaseAppFeedbackToApp", "appFeedbackToSupabase", "loadUsageEvents", "loadSupabaseDb", "saveSupabaseDb", "saveDb", "publicConversation"]) {
    vm.runInContext(declaration(name), context);
  }
  context.db = await context.loadSupabaseDb();
  return { context, rows, opening, requests, fail: value => { failure = value; }, disk: () => disk };
}

test("interrupted message save preserves historical rows and retries exactly once", async t => {
  const f = await fixture(t);
  f.context.db.conversations[0].messages.push({ role: "user", content: "Synthetic reply" });
  f.fail("before");
  await f.context.saveDb();
  assert.equal(f.rows.size, 1, "failed insert must not delete the historical opening");
  assert.deepEqual(f.rows.get(f.opening.id), f.opening);
  assert.ok(f.disk().conversations[0].messages.every(message => message.id), "fallback must retain stable IDs before remote write");
  f.fail("");
  f.context.db = f.disk();
  await f.context.saveDb();
  await f.context.saveDb();
  assert.equal(f.rows.size, 2, "fallback restart and repeated save must not duplicate messages");
  assert.equal(f.requests.filter(request => request.method === "DELETE").length, 0);
  const writes = f.requests.filter(request => request.table === "conversation_messages" && request.method === "POST");
  assert.equal(writes.length, 3);
  assert.ok(writes.every(request => request.query === "?on_conflict=id"));
});

test("lost response after commit is idempotent across fallback restart and Supabase reload", async t => {
  const f = await fixture(t);
  f.context.db.conversations[0].messages.push({ role: "user", content: "Synthetic reply" });
  f.fail("after");
  await f.context.saveDb();
  assert.equal(f.rows.size, 2);
  f.fail("");
  f.context.db = f.disk();
  await f.context.saveDb();
  f.context.db = await f.context.loadSupabaseDb();
  await f.context.saveDb();
  assert.equal(f.rows.size, 2);
  assert.ok(f.rows.has(f.opening.id), "loaded historical row ID must be preserved");
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.publicConversation(f.context.db.conversations[0], { includeMessages: true }).messages)), [
    { role: "assistant", content: "Synthetic opening" }, { role: "user", content: "Synthetic reply" }
  ]);
});

test("all conversations use one message upsert and an empty history never deletes remote rows", async t => {
  const f = await fixture(t);
  f.context.db.conversations.push({ id: randomUUID(), createdAt: f.opening.created_at, messages: [{ role: "assistant", content: "Another synthetic opening" }] });
  await f.context.saveDb();
  assert.equal(f.rows.size, 2);
  assert.equal(f.requests.filter(request => request.table === "conversation_messages" && request.method === "POST").length, 1);
  f.context.db.conversations.forEach(conversation => { conversation.messages = []; });
  await f.context.saveDb();
  assert.equal(f.rows.size, 2);
  assert.equal(f.requests.filter(request => request.method === "DELETE").length, 0);
});
