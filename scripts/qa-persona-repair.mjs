import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { root, loadManifest, runScenario } from './qa-persona-purposeful.mjs';
import { caller, liveTransport, readRecord, saveRecord, sha, startRuntime, settingsFor, variants, sourceHashes, textOf, isComplete } from './purposeful-runtime.mjs';
import { createBudget } from '../lib/qa-budget.js';

// This new repair protocol preserves the exhausted prior run and its append-only accounting.
const [mode, variantId = 'luna-production', run = '1'] = process.argv.slice(2);
assert.ok(['baseline', 'repaired', 'chat', 'feedback', 'trajectory'].includes(mode));
assert.ok(Object.hasOwn(variants, variantId));
assert.match(run, /^[A-Za-z0-9_-]+$/);
assert.equal(process.env.QA_LIVE, '1', 'Paid execution requires QA_LIVE=1');
const path = await realpath(process.env.QA_ENV_FILE || '');
assert.equal(path.replaceAll('\\', '/').toLowerCase(), 'c:/users/wish/downloads/gospel-conversation-simulator.env');
const keys = parseEnv(await readFile(path, 'utf8'));
assert.ok(keys.OPENAI_API_KEY);
if (variants[variantId].provider === 'anthropic') assert.ok(keys.ANTHROPIC_API_KEY);
const budget = createBudget(root), transport = liveTransport(keys);
const out = join(root, '.omo/qa/persona-repair-2026-10-15', mode, variantId, run);
const beforeBudget = budget.status(), hashes = await sourceHashes(root);
const priorRoot = join(root, '.omo/qa/purposeful/versions/task9-v1/mini-low/D1-main');
const prior = await readRecord(join(priorRoot, 'state.json'));
assert.ok(prior.synthetic && prior.conversation.messages.length === 49);
const settings = settingsFor(variants[variantId]);
const results = [], cleanups = [];
try {
  if (mode === 'trajectory') {
    const { manifest } = await loadManifest();
    const scenario = manifest.scenarios.find(s => s.id === run);
    assert.ok(scenario && scenario.runIds.length === 1, 'Select one non-branch scenario');
    const result = await runScenario({ manifest, scenario, runId: scenario.runIds[0], variantId, out, budget, transport, checkpointPolicy: scenario.id === 'D1' ? 'controller-fixed-v3' : 'response-conditioned-v1', onCleanup: c => cleanups.push(c) });
    results.push({ scenario: run, status: result.state.status, evaluation: result.state.evaluation.status });
  } else {
    for (const [name, userIndex] of [['U6', 11], ['U13', 25], ['feedback', null]]) {
      if (mode === 'chat' && name === 'feedback' || mode === 'feedback' && name !== 'feedback') continue;
      const callOut = join(out, name);
      const call = caller({ budget, transport, out: callOut, prefix: sha(callOut).slice(0, 20) });
      if (mode === 'baseline') {
        const captured = await readRecord(join(priorRoot, 'calls', name + '-0.json'));
        const selected = settings.ai[name === 'feedback' ? 'feedback' : 'chat'];
        assert.equal(selected.provider, 'openai');
        const payload = { ...captured.payload, model: selected.model, reasoning: { effort: selected.reasoningEffort }, max_output_tokens: selected.maxOutputTokens };
        const response = await call(name + '-0', 'openai', payload);
        assert.ok(isComplete(response.finish), 'Replay incomplete');
        results.push({ name, sourcePayloadHash: captured.payloadHash, text: textOf('openai', response.body), finish: response.finish });
      } else {
        const conversation = { ...prior.conversation, status: 'active', feedbackText: null, feedbackSummary: null, messages: userIndex === null ? prior.conversation.messages : prior.conversation.messages.slice(0, userIndex) };
        const runtime = await startRuntime({ root, settings, conversation, call });
        try {
          runtime.begin(name);
          const response = await runtime.request(name === 'feedback' ? '/api/feedback' : '/api/chat', name === 'feedback' ? { conversationId: conversation.id } : { conversationId: conversation.id, expectedMessageCount: conversation.messages.length, message: { role: 'user', content: prior.conversation.messages[userIndex].content } });
          results.push({ name, status: response.status, text: response.data.text || null });
          await saveRecord(join(callOut, 'result.json'), { response, conversation: await runtime.detail(conversation.id), errors: runtime.errors });
          assert.equal(response.status, 200, 'Replay API failed');
        } finally { cleanups.push(await runtime.cleanup()); }
      }
      await saveRecord(join(out, 'results.json'), { mode, variantId, run, hashes, settings, results, cleanups });
      console.log(JSON.stringify({ mode, variantId, run, case: name, status: 'recorded', remainingUsd: budget.status().remainingUsd }));
    }
  }
  assert.deepEqual(await sourceHashes(root), hashes, 'Source changed during paid replay');
} finally {
  await saveRecord(join(out, 'receipt.json'), { mode, variantId, run, hashes, settings, results, cleanups, beforeBudget, afterBudget: budget.status() });
}
