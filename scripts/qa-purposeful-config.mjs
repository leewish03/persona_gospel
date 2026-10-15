import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const pause = ms => new Promise(done => setTimeout(done, ms));

export async function runConfigContracts({ requireRealSdk = false } = {}) {
  const root = process.cwd();
  const sdkIndex = process.argv.indexOf('--sdk-root');
  if (sdkIndex !== -1) assert.ok(process.argv[sdkIndex + 1], '--sdk-root requires the temporary installation path');
  const sdkPath = sdkIndex === -1 ? process.env.QA_CONFIG_SDK_ROOT || '' : process.argv[sdkIndex + 1];
  assert.ok(!requireRealSdk || sdkPath, 'Config dispatch requires actual SDK 5.3.0: set QA_CONFIG_SDK_ROOT to its task-owned installation');
  const sdkRoot = sdkPath ? resolve(sdkPath) : '';
  const command = requireRealSdk ? 'node scripts/qa-purposeful-contracts.mjs --case config' : 'node scripts/qa-purposeful-config.mjs' + (sdkRoot ? ` --sdk-root ${JSON.stringify(sdkPath)}` : '');
  const evidence = resolve('.omo/evidence/purposeful-persona-training/task-8-prep', requireRealSdk ? 'dispatcher' : sdkRoot ? 'real-sdk' : '.');
  const tempRoot = resolve('.omo/tmp/task8prep');
  await mkdir(evidence, { recursive: true });
  await mkdir(tempRoot, { recursive: true });
  let sdkEntry = '', sdkProvenance = null;
  if (sdkRoot) {
    assert.ok(sdkRoot.startsWith(tempRoot + sep), 'SDK installation must be inside task8prep temporary storage');
    const manifestPath = join(sdkRoot, 'node_modules/@langfuse/client/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.version, '5.3.0');
    const entryPath = resolve(sdkRoot, 'node_modules/@langfuse/client', manifest.exports['.'].import);
    assert.ok(entryPath.startsWith(sdkRoot + sep));
    sdkEntry = pathToFileURL(entryPath).href;
    const lock = await readFile(join(sdkRoot, 'package-lock.json'));
    await writeFile(join(evidence, 'sdk-package-lock.json'), lock);
    sdkProvenance = { package: manifest.name, version: manifest.version, resolvedEntry: entryPath, entrySha256: sha(await readFile(entryPath)), packageSha256: sha(await readFile(manifestPath)), lockSha256: sha(lock), telemetry: 'local sink; not actual telemetry SDK/export' };
    await writeFile(join(evidence, 'sdk-provenance.json'), json(sdkProvenance));
  }
  const sdkBoundary = sdkEntry ? 'Actual @langfuse/client 5.3.0 with loopback prompt API; telemetry SDK is a local sink. No production ingestion tested.' : 'Langfuse client is a local HTTP fixture and telemetry SDK a local sink; production trace assembly and registry run unchanged. Installed SDK compatibility and remote ingestion are not tested.';
  const sourceFiles = ['scripts/qa-purposeful-contracts.mjs', 'scripts/qa-purposeful-config.mjs', 'server.js', 'lib/langfuse-prompts.js', 'lib/langfuse-tracing.js', 'lib/persona-advisory.js', 'lib/roleplay-context.js', 'lib/openai-usage.js', 'prompts/persona-system-prompt.md', 'prompts/feedback-prompt.md', 'data/personas.json'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, sha(await readFile(path))])));
  const localPrompt = await readFile('prompts/persona-system-prompt.md', 'utf8');
  const remotePrompt = 'Isolated config fixture remote instruction; no production prompt.';
  const results = [], cleanup = [], output = [];
  const record = row => { results.push({ ...row, passed: true }); const line = `PASS ${row.scenario}`; output.push(line); console.log(line); };
  const baseEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const cases = [
    { id: 'remote-version-saved-over-env', remote: 'ok', saved: { model: 'gpt-5.4-mini', reasoningEffort: 'high', maxOutputTokens: 333 }, model: 'gpt-5.4-mini', source: 'langfuse' },
    { id: 'remote-disabled-local-saved-preserved', remote: 'disabled', saved: { model: 'gpt-5.4-mini', reasoningEffort: 'high', maxOutputTokens: 333 }, model: 'gpt-5.4-mini', source: 'file' },
    { id: 'remote-unavailable-local-env-preserved', remote: 'unavailable', model: 'gpt-5.4', source: 'file', negative: true },
    { id: 'environment-model-and-reasoning', remote: 'disabled', model: 'gpt-5.4', source: 'file' },
    { id: 'empty-model-falls-back-to-environment', remote: 'disabled', saved: { model: '', reasoningEffort: 'invalid' }, model: 'gpt-5.4', source: 'file', negative: true },
    { id: 'unknown-saved-model-recoverable', remote: 'ok', saved: { model: 'fixture-invalid-model' }, model: 'fixture-invalid-model', source: 'langfuse', negative: true }
  ];
  try {
    for (const scenario of cases) {
      const temp = await mkdtemp(join(tempRoot, 'run-'));
      let child, serverLog = '', fixtureError;
      const calls = [], remoteRequests = [];
      const tracePath = join(temp, 'trace.jsonl');
      const settings = { ai: { chat: scenario.saved || {} }, limits: { dailyChatMessages: 0, monthlyGlobalBudgetKrw: 0 } };
      const now = new Date().toISOString();
      const messages = [{ role: 'assistant', content: '합성 시작 발화.' }];
      const fixture = createServer(async (req, res) => {
        try {
          if (req.url.startsWith('/api/public/v2/prompts/')) {
            const url = new URL(req.url, 'http://fixture.local');
            const name = decodeURIComponent(url.pathname.slice('/api/public/v2/prompts/'.length));
            remoteRequests.push({ name, label: url.searchParams.get('label'), method: req.method });
            res.writeHead(scenario.remote === 'unavailable' ? 404 : 200, { 'content-type': 'application/json' });
            res.end(json(scenario.remote === 'unavailable' ? { message: 'Synthetic prompt unavailable' } : { name, version: 81, type: 'text', prompt: remotePrompt, labels: ['fixture-only'], tags: [], config: {}, isActive: true }));
            return;
          }
          assert.equal(req.url, '/provider');
          let body = ''; for await (const part of req) body += part;
          const payload = JSON.parse(body); calls.push(payload);
          const invalid = payload.model === 'fixture-invalid-model';
          res.writeHead(invalid ? 404 : 200, { 'content-type': 'application/json' });
          res.end(json(invalid ? { error: { code: 'model_not_found', message: 'Synthetic model unavailable' } } : { output_text: '합성 설정 확인 응답.', usage: { input_tokens: 10, output_tokens: 5 } }));
        } catch (error) { fixtureError = error; res.writeHead(500); res.end('{}'); }
      });
      try {
        await writeFile(join(temp, 'db.json'), json({ users: [{ id: 'owner', provider: 'dev', providerId: 'config@example.local', email: 'config@example.local', displayName: 'QA', profile: { name: 'QA' }, role: 'admin', createdAt: now }], conversations: [{ id: 'config', userId: 'owner', session: { personaId: 'kim-sihyun', relationship: 'casual_friend', setting: 'cafe_catchup', goal: 'listen_and_understand' }, messages, status: 'active', createdAt: now, updatedAt: now }], usageEvents: [], appFeedbacks: [], settings }));
        fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
        const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
        const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
        const port = reservation.address().port; await new Promise(done => reservation.close(done));
        const base = `http://127.0.0.1:${port}`;
        // Capture production trace arguments without copying registry, settings or trace assembly logic.
        const wrapper = `\nexport async function traceModelCall(args) { configAppend(${JSON.stringify(tracePath)}, JSON.stringify({kind:'entry',model:args.model,modelType:args.modelType,metadata:args.metadata})+'\\n'); return configOriginalTrace(args); }\n`;
        const telemetry = `import {appendFileSync} from 'node:fs'; export const propagateAttributes=(attributes,run)=>run(); export const startActiveObservation=async(name,run)=>run({update(value){if(value.metadata)appendFileSync(${JSON.stringify(tracePath)},JSON.stringify({kind:'observation',metadata:value.metadata})+'\\n');}});`;
        const stubs = {
          '@langfuse/client': 'export class LangfuseClient { prompt={get:async(name,{label})=>{const response=await fetch(process.env.LANGFUSE_BASE_URL+"/api/public/v2/prompts/"+encodeURIComponent(name)+"?label="+encodeURIComponent(label));if(!response.ok)throw Error("Synthetic prompt unavailable");return response.json();}};}',
          '@opentelemetry/sdk-node': 'export class NodeSDK { start() {} async shutdown() {} }',
          '@langfuse/otel': 'export class LangfuseSpanProcessor {}',
          '@langfuse/tracing': telemetry
        };
        if (sdkEntry) delete stubs['@langfuse/client'];
        const preload = `import {registerHooks} from 'node:module';
import {appendFileSync} from 'node:fs';
const stubs=${JSON.stringify(stubs)};
const sdkEntry=${JSON.stringify(sdkEntry)};
registerHooks({resolve(name,context,next){if(name==='@langfuse/client'&&sdkEntry)return next(sdkEntry,context);if(Object.hasOwn(stubs,name))return {url:'data:text/javascript,'+encodeURIComponent(stubs[name]),shortCircuit:true};return next(name,context);},load(url,context,next){const result=next(url,context);if(sdkEntry&&url===sdkEntry)appendFileSync(${JSON.stringify(tracePath)},JSON.stringify({kind:'sdk-load',url})+'\\n');if(url===${JSON.stringify(pathToFileURL(join(root, 'lib/langfuse-tracing.js')).href)}){const source=String(result.source);if(!source.includes('export async function traceModelCall('))throw Error('Trace probe boundary changed');return {...result,source:'import {appendFileSync as configAppend} from "node:fs";\\n'+source.replace('export async function traceModelCall(','async function configOriginalTrace(')+${JSON.stringify(wrapper)}};}return result;}});
const original=globalThis.fetch;
globalThis.fetch=(input,options)=>{const url=typeof input==='string'?input:input.url||String(input);if(url==='https://api.openai.com/v1/responses')return original(${JSON.stringify(fixtureUrl + '/provider')},options);if(url.startsWith(${JSON.stringify(fixtureUrl + '/api/public/v2/prompts/')}))return original(input,options);throw Error('Fixture blocked external network');};`;
        await writeFile(join(temp, 'preload.mjs'), preload);
        const enabled = scenario.remote !== 'disabled';
        child = spawn(process.execPath, ['--import', pathToFileURL(join(temp, 'preload.mjs')).href, 'server.js'], { cwd: root, env: { ...baseEnv, NODE_ENV: 'production', ENABLE_DEV_LOGIN: 'true', SESSION_SECRET: randomUUID(), ADMIN_EMAILS: 'config@example.local', PORT: String(port), HOST: '127.0.0.1', STORAGE_DIR: temp, OPENAI_API_KEY: randomUUID(), OPENAI_CHAT_MODEL: 'gpt-5.4', OPENAI_CHAT_REASONING_EFFORT: 'medium', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', LANGFUSE_PUBLIC_KEY: enabled ? randomUUID() : '', LANGFUSE_SECRET_KEY: enabled ? randomUUID() : '', LANGFUSE_BASE_URL: fixtureUrl, LANGFUSE_HOST: fixtureUrl, LANGFUSE_PROMPT_LABEL: 'fixture-only', RATE_LIMIT_MUTATIONS_PER_WINDOW: '1000' }, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', chunk => serverLog += chunk); child.stderr.on('data', chunk => serverLog += chunk);
        let ready = false, readinessError = '';
        for (let i = 0; i < 200; i++) {
          try { if ((await fetch(base + '/healthz', { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch (error) { readinessError = error.message + ': ' + error.cause?.message; }
          assert.equal(child.exitCode, null, 'fixture child exited before readiness'); await pause(50);
        }
        assert.ok(ready, 'fixture app readiness: ' + readinessError + ' ' + base + ' ' + serverLog.slice(0, 2000));
        const cookies = new Map();
        async function request(path, body, method = body === undefined ? 'GET' : 'POST', csrf = true) {
          const headers = { cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') };
          if (body !== undefined) { headers['content-type'] = 'application/json'; if (csrf) headers['x-csrf-token'] = decodeURIComponent(cookies.get('csrf') || ''); }
          const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
          for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
          return { status: response.status, data: await response.json() };
        }
        assert.equal((await request('/api/admin/settings')).status, 401);
        assert.equal((await request('/api/me')).status, 200);
        assert.equal((await request('/api/dev-login', { email: 'config@example.local' })).status, 200);
        assert.equal((await request('/api/admin/settings', { ai: { chat: { model: 'forged' } } }, 'PUT', false)).status, 403);
        const beforeSettings = await request('/api/admin/settings'); assert.equal(beforeSettings.status, 200);
        const before = await request('/api/conversations/config'); assert.equal(before.status, 200);
        const status = await request('/api/admin/langfuse-prompts'); assert.equal(status.status, 200, JSON.stringify(status.data) + ' ' + serverLog.slice(-3000));
        assert.equal(status.data.enabled, enabled);
        assert.equal(status.data.entries['roleplay/persona-system'].source, scenario.source);
        assert.equal(status.data.entries['roleplay/persona-system'].version, scenario.source === 'langfuse' ? 81 : null);
        const body = { conversationId: 'config', expectedMessageCount: 1, message: { role: 'user', content: '합성 설정 확인 질문.' } };
        const response = await request('/api/chat', body);
        assert.equal(response.status, scenario.model === 'fixture-invalid-model' ? 500 : 200);
        assert.equal(calls.length, 1);
        const traces = (await readFile(tracePath, 'utf8')).trim().split('\n').map(JSON.parse);
        const entry = traces.find(row => row.kind === 'entry'); assert.ok(entry);
        const sdkLoads = traces.filter(row => row.kind === 'sdk-load');
        if (sdkEntry) assert.equal(sdkLoads.length, enabled ? 1 : 0, 'actual SDK import boundary');
        assert.equal(entry.metadata.promptSource, scenario.source);
        assert.equal(entry.metadata.promptVersion, scenario.source === 'langfuse' ? 81 : null);
        assert.equal(entry.model, scenario.model); assert.equal(calls[0].model, scenario.model);
        assert.equal(calls[0].instructions, scenario.source === 'langfuse' ? remotePrompt : localPrompt);
        assert.equal(calls[0].max_output_tokens, scenario.saved?.maxOutputTokens || 1536);
        assert.equal(calls[0].reasoning.effort, scenario.saved?.reasoningEffort === 'high' ? 'high' : 'medium');
        const observation = traces.find(row => row.kind === 'observation');
        if (enabled) { assert.ok(observation); assert.equal(observation.metadata.model, scenario.model); assert.equal(observation.metadata.promptSource, scenario.source); assert.equal(observation.metadata.promptVersion, entry.metadata.promptVersion); }
        else assert.equal(observation, undefined, 'disabled tracing must not export observations');
        let recovery;
        if (scenario.model === 'fixture-invalid-model') {
          assert.deepEqual((await request('/api/conversations/config')).data.conversation.messages, before.data.conversation.messages);
          assert.equal((await request('/api/admin/settings')).data.settings.ai.chat.model, scenario.model);
          assert.equal(typeof response.data.error, 'string'); assert.ok(response.data.error.length > 0);
          assert.equal((await request('/api/admin/settings', { ai: { chat: { model: 'gpt-6-luna' } } }, 'PUT')).status, 200);
          assert.equal((await request('/api/chat', body)).status, 200);
          assert.equal(calls.at(-1).model, 'gpt-6-luna');
          assert.equal((await request('/api/conversations/config')).data.conversation.messages.length, 3);
          recovery = { errorHttpStatus: response.status, historyPreserved: true, savedOverridePreservedOnError: true, adminRepairHttpStatus: 200, retryHttpStatus: 200 };
        } else {
          assert.equal((await request('/api/conversations/config')).data.conversation.messages.length, 3);
          assert.deepEqual((await request('/api/admin/settings')).data.settings.ai.chat, beforeSettings.data.settings.ai.chat);
        }
        if (enabled) { assert.equal(remoteRequests.length, 2); assert.ok(remoteRequests.every(row => row.label === 'fixture-only' && row.method === 'GET')); }
        else assert.equal(remoteRequests.length, 0);
        if (fixtureError) throw fixtureError;
        const disk = JSON.parse(await readFile(join(temp, 'db.json'), 'utf8'));
        const effectiveSettings = { model: calls[0].model, maxOutputTokens: calls[0].max_output_tokens, reasoningEffort: calls[0].reasoning.effort };
        record({ scenario: scenario.id, negative: !!scenario.negative, httpStatus: response.status, source: entry.metadata.promptSource, version: entry.metadata.promptVersion, traceModel: entry.model, observationMetadata: observation?.metadata || null, traceEntryMetadata: entry.metadata, tracingDisabled: !enabled, actualSdkLoads: sdkLoads.length, sdkEntry: sdkLoads[0]?.url || null, effectiveSettings, settingsInputSha256: sha(json(settings)), effectiveSettingsSha256: sha(json(effectiveSettings)), persistedSettingsSha256: sha(json(disk.settings.ai)), promptSha256: sha(calls[0].instructions), instrumentationSha256: sha(preload), providerCalls: calls.length, remoteRequests, authRejected: 401, missingCsrfRejected: 403, ...(recovery ? { recovery } : {}) });
      } finally {
        if (child && child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'exit'); }
        fixture.closeAllConnections(); if (fixture.listening) await new Promise(done => fixture.close(done));
        assert.ok(temp.startsWith(tempRoot + sep)); await rm(temp, { recursive: true, force: true });
        await assert.rejects(access(temp));
        const row = { scenario: scenario.id, childPid: child?.pid || null, childExited: !child || child.exitCode !== null || child.signalCode !== null, fixtureClosed: !fixture.listening, tempRemoved: temp, externalProviderCalls: 0, rawServerLogSha256: sha(serverLog), rawLogPersisted: false };
        assert.ok(row.childExited && row.fixtureClosed); cleanup.push(row);
        await writeFile(join(evidence, 'cleanup.json'), json(cleanup));
      }
    }
    const temp = await mkdtemp(join(tempRoot, 'run-hash-'));
    try {
      await mkdir(join(temp, 'prompts'));
      await writeFile(join(temp, 'prompts/persona-system-prompt.md'), localPrompt);
      const registryProbe = `import assert from 'node:assert/strict'; import {readFile,writeFile} from 'node:fs/promises'; import {createHash} from 'node:crypto'; import {createPromptRegistry} from ${JSON.stringify(pathToFileURL(join(root, 'lib/langfuse-prompts.js')).href)};
const path=${JSON.stringify(join(temp, 'prompts/persona-system-prompt.md'))}; const original=await readFile(path,'utf8'); const changed=original+'\\nSynthetic local hash mutation.\\n'; const name='roleplay/persona-system'; const options={rootDir:${JSON.stringify(temp)},fallbacks:{[name]:original}}; const registry=createPromptRegistry(options); const first=await registry.get(name); await writeFile(path,changed); registry.clear(); const cachedStartup=await registry.get(name); assert.equal(cachedStartup.text,original); const restarted=createPromptRegistry({...options,fallbacks:{[name]:await readFile(path,'utf8')}}); const next=await restarted.get(name); assert.equal(next.source,'file');assert.equal(next.version,null);assert.equal(next.text,changed); const hash=value=>createHash('sha256').update(value).digest('hex');assert.notEqual(hash(first.text),hash(next.text));console.log(JSON.stringify({originalHash:hash(first.text),changedHash:hash(next.text),source:next.source,version:next.version,refreshRetainsStartupFallback:true,restartLoadsChangedFallback:true}));`;
      await writeFile(join(temp, 'probe.mjs'), registryProbe);
      const child = spawn(process.execPath, [join(temp, 'probe.mjs')], { cwd: root, env: { ...baseEnv, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = ''; child.stdout.on('data', c => stdout += c); child.stderr.on('data', c => stderr += c);
      const timer = setTimeout(() => child.kill(), 15000);
      let code;
      try { [code] = await once(child, 'exit'); } finally { clearTimeout(timer); }
      assert.equal(code, 0, stderr || 'registry probe timed out');
      record({ scenario: 'changed-local-prompt-hash-requires-startup-reload', negative: true, ...JSON.parse(stdout), probeSha256: sha(registryProbe) });
      cleanup.push({ scenario: 'local-hash', childPid: child.pid, childExited: true, tempRemoved: temp });
    } finally { assert.ok(temp.startsWith(tempRoot + sep)); await rm(temp, { recursive: true, force: true }); await assert.rejects(access(temp)); await writeFile(join(evidence, 'cleanup.json'), json(cleanup)); }
    assert.equal(results.length, 7);
    for (const path of sourceFiles) assert.equal(sha(await readFile(path)), sourceHashes[path], 'source changed during fixture: ' + path);
    const payload = await Promise.all([['roleplay/persona-system', 'prompts/persona-system-prompt.md'], ['roleplay/feedback-system', 'prompts/feedback-prompt.md']].map(async ([name, path]) => ({ name, type: 'text', prompt: await readFile(path, 'utf8'), labels: ['staging'] })));
    await writeFile(join(evidence, 'local-rollout-payload.json'), json(payload));
    await writeFile(join(evidence, 'rollout-draft.json'), json({ status: 'PREPARATION_ONLY', productionPublished: false, payloadFile: 'local-rollout-payload.json', payloadSha256: sha(json(payload)), sourceHashes, labels: ['staging'], qualityWinner: null, defaultChange: false, rollbackDraft: ['Before any authorized publish, record active remote name/version/label and effective saved/env settings.', 'Validate staging source/version via authenticated prompt status and trace metadata before label promotion.', 'Rollback by restoring previously recorded production labels and restarting to clear remote SDK cache; retain saved/env settings.', 'If remote prompts are disabled/unavailable, local file text is loaded at process startup; prompt refresh alone does not reload changed fallback text. Restart after restoring the recorded file hashes.'], limitations: ['No production version queried or production label changed.', 'No model quality outcome or default recommendation inferred.', sdkBoundary] }));
    const common = { command, passed: true, status: 'PREPARED', executedTotal: results.length, sourceHashes, externalProviderCalls: 0, sdkProvenance, telemetryBoundary: sdkBoundary, limitations: ['Existing observation metadata includes model/source/version but not maxOutputTokens or reasoningEffort; actual provider payload verifies those settings separately.', 'No full task 8 completion; task 7 outcome and integration acceptance checks pending.'] };
    await writeFile(join(evidence, 'config.json'), json({ ...common, executedScenarios: results.filter(row => !row.negative).length, results: results.filter(row => !row.negative) }));
    await writeFile(join(evidence, 'failures.json'), json({ ...common, executedScenarios: results.filter(row => row.negative).length, results: results.filter(row => row.negative) }));
    output.push('PASS 7 config scenarios; 0 external provider calls; PREPARED only');
    console.log(output.at(-1));
    await writeFile(join(evidence, 'validation.log'), output.join('\n') + '\n');
    await writeFile(join(evidence, 'receipt.json'), json({ command, exitCode: 0, executedScenarios: 7, artifactFiles: ['config.json', 'failures.json', 'cleanup.json', 'validation.log', 'local-rollout-payload.json', 'rollout-draft.json'], sourceHashes, sdkProvenance }));
  } catch (error) {
    await writeFile(join(evidence, 'failed-run.json'), json({ command, passed: false, error: String(error.stack), completedScenarios: results.length, results, sourceHashes }));
    await writeFile(join(evidence, 'validation.log'), output.join('\n') + '\nFAIL ' + String(error.stack) + '\n');
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await runConfigContracts();
