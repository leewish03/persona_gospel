import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const variants = {
  'sol-balanced': { provider: 'openai', model: 'gpt-6.1-sol', reasoningEffort: 'low', maxOutputTokens: 1536, feedback: { provider: 'openai', model: 'gpt-6.1-sol', reasoningEffort: 'low', maxOutputTokens: 4096 } },
  'luna-low': { provider: 'openai', model: 'gpt-6-luna' },
  'haiku-low': { provider: 'anthropic', model: 'claude-haiku-5-5' },
  'mini-low': { provider: 'openai', model: 'gpt-5.4-mini' },
  'luna-production': { provider: 'openai', model: 'gpt-6-luna', feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'medium' } },
  'haiku-production': { provider: 'anthropic', model: 'claude-haiku-5-5', feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'medium', thinkingType: 'disabled' } },
  'luna-medium-production': { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'medium', maxOutputTokens: 1536, feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'medium' } },
  'luna-feedback-low': { provider: 'openai', model: 'gpt-6-luna', feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'low' } },
  'luna-medium-feedback-low': { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'medium', maxOutputTokens: 1536, feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'low' } },
  'luna-balanced': { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'medium', maxOutputTokens: 1536, feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'low', maxOutputTokens: 4096 } },
  'gpt54-balanced': { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'low', maxOutputTokens: 1536, feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'low', maxOutputTokens: 4096 } },
  'gpt54-production': { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'medium', maxOutputTokens: 1536, feedback: { provider: 'openai', model: 'gpt-5.4', reasoningEffort: 'medium' } }
};
export function settingsFor(variant) {
  const { feedback, ...chat } = variant;
  const model = { ...chat, reasoningEffort: chat.reasoningEffort || 'low', thinkingType: chat.provider === 'anthropic' ? 'adaptive' : 'disabled' };
  return { ai: { chat: { ...model, maxOutputTokens: chat.maxOutputTokens || 768 }, feedback: { ...model, ...feedback, maxOutputTokens: feedback?.maxOutputTokens || 2600 } }, limits: { dailyChatMessages: 0, dailyFeedbacks: 0, monthlyGlobalBudgetKrw: 0 } };
}
export async function readRecord(path) {
  try {
    const record = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(record.sha256, sha(JSON.stringify(record.data)), `Artifact hash mismatch: ${path}`);
    return record.data;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function saveRecord(path, data, immutable = false) {
  await mkdir(dirname(path), { recursive: true });
  const text = JSON.stringify({ sha256: sha(JSON.stringify(data)), data }, null, 2) + '\n';
  if (immutable) return writeFile(path, text, { flag: 'wx' });
  await writeFile(path + '.tmp', text); await rename(path + '.tmp', path);
}
export async function sourceHashes(root) {
  const files = ['server.js', 'lib/persona-advisory.js', 'lib/roleplay-context.js', 'lib/feedback-evidence.js', 'lib/langfuse-prompts.js', 'lib/langfuse-tracing.js', 'lib/openai-usage.js', 'lib/qa-budget.js', 'prompts/persona-system-prompt.md', 'prompts/feedback-prompt.md', 'data/personas.json', 'scripts/fixtures/purposeful-scenarios.json', 'scripts/qa-persona-purposeful.mjs', 'scripts/purposeful-runtime.mjs', 'scripts/purposeful-evaluation.mjs', 'scripts/purposeful-self-test.mjs'];
  files.push('scripts/qa-persona-repair.mjs', 'scripts/purposeful-checkpoints.test.mjs');
  return Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await readFile(join(root, file)))])));
}
export const endpoints = { openai: 'https://api.openai.com/v1/responses', anthropic: 'https://api.anthropic.com/v1/messages' };
export function textOf(provider, body) {
  return provider === 'anthropic' ? (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') : body.output_text || (body.output || []).flatMap(b => b.content || []).filter(b => b.type === 'output_text').map(b => b.text).join('\n');
}
export function finishOf(provider, body) { return provider === 'anthropic' ? body.stop_reason : body.status; }
export const isComplete = status => ['completed', 'end_turn', 'stop_sequence'].includes(status);

// The bridge captures the actual runtime adapter body, including retries and thinking caps.
export function caller({ budget, out, transport, prefix }) {
  return async (id, provider, payload) => {
    assert.ok(Object.hasOwn(endpoints, provider), 'Unsupported provider');
    assert.equal(payload.model.startsWith('claude-') ? 'anthropic' : 'openai', provider);
    const path = join(out, 'calls', `${id}.json`), payloadHash = sha(JSON.stringify(payload));
    const prior = await readRecord(path);
    if (prior) {
      assert.equal(prior.payloadHash, payloadHash, 'Resume payload changed');
      assert.equal(prior.provider, provider);
      assert.ok(prior.body && !prior.unknown, 'Uncertain call cannot be replayed');
      budget.settle(prior.reservationId, { status: prior.finish, usage: prior.body.usage ?? null });
      return prior;
    }
    const reservationId = `${prefix}:${id}`;
    const request = { model: payload.model, inputTokenBound: Buffer.byteLength(JSON.stringify(payload), 'utf8') + 4096, maxOutputTokens: payload.max_output_tokens || payload.max_tokens };
    budget.reserve(reservationId, request);
    const started = performance.now();
    let result;
    try {
      const response = await transport(provider, payload);
      result = { reservationId, provider, payload, payloadHash, request, httpStatus: response.status, body: response.body, finish: response.status === 200 ? finishOf(provider, response.body) || 'unknown' : `http-${response.status}`, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      result = { errorType: error.name, errorCode: error.code || error.cause?.code || null, reservationId, provider, payload, payloadHash, request, finish: 'unknown', unknown: true, latencyMs: Math.round(performance.now() - started) };
    }
    await saveRecord(path, result, true);
    budget.settle(reservationId, { status: result.finish, usage: result.body?.usage ?? null });
    assert.ok(!result.unknown, 'Provider outcome unknown; reservation retained');
    return result;
  };
}
export function liveTransport(keys) {
  return async (provider, payload) => {
    const headers = provider === 'openai' ? { Authorization: `Bearer ${keys.OPENAI_API_KEY}` } : { 'x-api-key': keys.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' };
    const response = await fetch(endpoints[provider], { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(55000) });
    return { status: response.status, body: await response.json() };
  };
}
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
export async function startRuntime({ root, settings, conversation = null, call }) {
  const baseDir = resolve(root, '.omo/tmp/task6'); await mkdir(baseDir, { recursive: true });
  const temp = await mkdtemp(join(baseDir, 'app-'));
  let child, operation = 'start', sequence = 0, log = '';
  const captures = [], errors = [];
  const bridge = createServer(async (req, res) => {
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const payload = JSON.parse(raw), provider = req.url.slice(1);
      const id = `${operation}-${sequence++}`;
      const result = await call(id, provider, payload);
      captures.push({ id, ...result });
      res.writeHead(result.httpStatus, { 'content-type': 'application/json' }); res.end(JSON.stringify(result.body));
    } catch (error) {
      errors.push({ operation, error: error.message });
      res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'QA bridge blocked or uncertain request' } }));
    }
  });
  const cleanup = async () => {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    bridge.closeAllConnections(); if (bridge.listening) await new Promise(r => bridge.close(r));
    assert.ok(temp.startsWith(baseDir + sep)); await rm(temp, { recursive: true, force: true });
    return { pid: child?.pid, exited: !child || child.exitCode !== null || child.signalCode !== null, temporaryDirectoryRemoved: true };
  };
  try {
    const bridgePort = await listen(bridge), probe = createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
    const now = new Date().toISOString();
    await writeFile(join(temp, 'db.json'), JSON.stringify({ users: [{ id: 'owner', provider: 'dev', providerId: 'task6@example.local', email: 'task6@example.local', displayName: 'QA', role: 'user', profile: { name: 'QA' }, createdAt: now }], conversations: conversation ? [{ ...conversation, userId: 'owner' }] : [], usageEvents: [], appFeedbacks: [], settings }));
    // Only network routing is injected; production prompts, state and adapters run unchanged.
    const preload = `const original=globalThis.fetch;const endpoints=${JSON.stringify(endpoints)};globalThis.fetch=(url,options)=>{const p=Object.keys(endpoints).find(p=>endpoints[p]===String(url));if(p)return original('http://127.0.0.1:${bridgePort}/'+p,options);throw Error('QA forbids external network');};`;
    await writeFile(join(temp, 'preload.mjs'), preload);
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATHEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    Object.assign(env, { NODE_ENV: 'production', ENABLE_DEV_LOGIN: 'true', SESSION_SECRET: 'task6-synthetic-only', PORT: String(port), HOST: '127.0.0.1', STORAGE_DIR: temp, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '', LANGFUSE_ENABLED: 'false', OPENAI_API_KEY: 'local-bridge-only', ANTHROPIC_API_KEY: 'local-bridge-only', RATE_LIMIT_MUTATIONS_PER_WINDOW: '10000' });
    child = spawn(process.execPath, ['--import', pathToFileURL(join(temp, 'preload.mjs')).href, 'server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', c => log += c); child.stderr.on('data', c => log += c);
    const base = `http://127.0.0.1:${port}`, cookies = new Map();
    async function request(path, body) {
      const headers = { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
      if (body !== undefined) Object.assign(headers, { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(cookies.get('csrf') || '') });
      const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(250000) });
      for (const row of response.headers.getSetCookie()) { const pair = row.split(';')[0], i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      const data = await response.json();
      if (response.status >= 500) {
        let appLog = '';
        try { appLog = await readFile(join(temp, 'app-logs.jsonl'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        errors.push({ operation, path, kind: 'app_http_error', status: response.status, serverOutput: log, appLog });
      }
      return { status: response.status, data };
    }
    let ready = false, readinessError = "";
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/healthz', { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch (error) { readinessError = String(error.message) + " / " + String(error.cause?.message); } if (child.exitCode !== null) throw Error('Runtime exited before ready'); await new Promise(r => setTimeout(r, 50)); }
    assert.ok(ready, 'Runtime readiness ' + base + ': ' + readinessError + ' ' + log.slice(-1500));
    assert.equal((await request('/api/me')).status, 200);
    assert.equal((await request('/api/dev-login', { email: 'task6@example.local' })).status, 200);
    return { request, captures, errors, cleanup, begin(id) { operation = id; sequence = 0; }, async detail(id) { return (await request('/api/conversations/' + id)).data.conversation; } };
  } catch (error) { error.cleanup = await cleanup(); throw error; }
}
