import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, stat, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createBudget, usageCost } from '../lib/qa-budget.js';
import { caller, liveTransport, sourceHashes, settingsFor, variants, readRecord, saveRecord, sha, startRuntime, textOf, isComplete } from './purposeful-runtime.mjs';
import { validateManifest, simulatorInput, simulatorInstructions, validateDecision, evaluateRun, globalEnd, scheduleCheckpoint } from './purposeful-evaluation.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function loadManifest() {
  const bytes = await readFile(join(root, 'scripts/fixtures/purposeful-scenarios.json'));
  const personas = JSON.parse(await readFile(join(root, 'data/personas.json'), 'utf8'));
  const validation = validateManifest(bytes, personas);
  return { manifest: JSON.parse(bytes), validation };
}
export async function callRecords(out) {
  try { return await Promise.all((await readdir(join(out, 'calls'))).filter(f => f.endsWith('.json')).sort().map(f => readRecord(join(out, 'calls', f)))); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
export async function runScenario({ manifest, scenario, runId, variantId, out, budget, transport, resume = false, fixtureSimulator, interruptAfter, checkpointPolicy = 'response-conditioned-v1', onCleanup = () => {} }) {
  assert.ok(['response-conditioned-v1', 'controller-fixed-v3'].includes(checkpointPolicy));
  assert.ok(checkpointPolicy !== 'controller-fixed-v3' || scenario.id === 'D1', 'Controlled probes currently support only D1 ordinary user-owned facts; other scenarios require response-conditioned consent and capture');
  const variant = variants[variantId]; assert.ok(variant);
  const settings = settingsFor(variant), hashes = await sourceHashes(root);
  hashes.settings = sha(JSON.stringify(settings));
  const statePath = join(out, 'state.json');
  let state = await readRecord(statePath);
  if (state) {
    assert.ok(resume, 'Existing result requires --resume; artifacts are never overwritten by a fresh run');
    assert.equal(state.checkpointPolicy || 'response-conditioned-v1', checkpointPolicy, 'Resume checkpoint policy changed');
    assert.deepEqual(state.hashes, hashes, 'Resume source/settings changed');
    assert.equal(state.runId, runId); assert.equal(state.variantId, variantId);
    if (state.status === 'complete' || state.status === 'early_ended' && state.feedback) {
      const priorEvaluation = evaluateRun(state, scenario, await callRecords(out), hashes);
      assert.ok(!priorEvaluation.assertions.some(a => a.status === 'unknown'), 'Confirmed run has missing or invalid evidence');
      return { state, reused: true };
    }
    assert.ok(['running', 'early_ended'].includes(state.status), 'Failed/unknown run requires explicit investigation, never an automatic paid retry');
  } else {
    state = { schemaVersion: 2, checkpointPolicy, synthetic: true, mode: fixtureSimulator ? 'fixture' : 'live', runId, scenarioId: scenario.id, variantId, split: scenario.split, settings, hashes, promptSource: { source: 'file', version: null, langfuseDisabled: true }, status: 'running', nextTurn: 1, decisions: [], conversation: null, start: null, feedback: null };
    await saveRecord(statePath, state);
  }
  const call = caller({ budget, out, transport, prefix: sha(out).slice(0, 20) });
  let runtime;
  try { runtime = await startRuntime({ root, settings, conversation: state.conversation, call }); }
  catch (error) { state.status = 'unknown'; state.error = error.message; await saveRecord(statePath, state); if (error.cleanup) onCleanup(error.cleanup); throw error; }
  async function persist() { await saveRecord(statePath, state); }
  try {
    if (!state.start) {
      runtime.begin('start');
      state.start = await runtime.request('/api/start', { session: { personaId: scenario.personaId, ...scenario.sessionContext } });
      assert.equal(state.start.status, 200, 'Canonical start failed');
      state.conversation = await runtime.detail(state.start.data.conversationId);
      assert.equal(state.conversation.messages.length, 1);
      assert.equal(state.conversation.messages[0].content, state.start.data.text);
      await persist();
    }
    for (let turn = state.nextTurn; state.status === 'running' && turn <= 24; turn++) {
      const checkpoint = scenario.checkpoints[turn - 1], branch = runId.split('-').at(-1);
      if (globalEnd(state.conversation.messages.at(-1).content)) { state.status = 'early_ended'; state.stopReason = { turn, reason: 'observed_global_end', assistantIndex: state.conversation.messages.length - 1 }; await persist(); break; }
      const projection = simulatorInput(manifest, scenario, checkpoint, branch, state.conversation.messages);
      let decision;
      if (fixtureSimulator) decision = await fixtureSimulator(projection, checkpoint, state);
      else {
        const payload = { model: 'gpt-6-luna', instructions: simulatorInstructions, input: JSON.stringify(projection), max_output_tokens: 2048, reasoning: { effort: 'low' }, store: false };
        const response = await call('sim-U' + turn, 'openai', payload);
        assert.ok(isComplete(response.finish), 'Simulator truncated/unknown');
        decision = JSON.parse(textOf('openai', response.body));
      }
      validateDecision(decision, state.conversation.messages, checkpoint, branch);
      if (checkpointPolicy === 'controller-fixed-v3') decision = scheduleCheckpoint(decision, state.conversation.messages, checkpoint, scenario, state.decisions);
      validateDecision(decision, state.conversation.messages, checkpoint, branch);
      if (decision.decision === 'stop') {
        state.status = 'early_ended'; state.stopReason = { turn, decision, assistantIndex: state.conversation.messages.length - 1 }; await persist(); break;
      }
      const before = state.conversation.messages.length;
      runtime.begin('U' + turn);
      const response = await runtime.request('/api/chat', { conversationId: state.conversation.id, expectedMessageCount: before, message: { role: 'user', content: decision.reply } });
      assert.equal(response.status, 200, 'Canonical chat failed at U' + turn);
      state.conversation = await runtime.detail(state.conversation.id);
      assert.equal(state.conversation.messages.length, before + 2);
      assert.equal(state.conversation.messages[before].content, decision.reply);
      assert.equal(state.conversation.messages[before + 1].content, response.data.text);
      state.decisions.push({ ...decision, turn, checkpointId: checkpoint.checkpointId, eventId: decision.checkpointDelivered ? checkpoint.eventId || null : null, canonicalMessageIndex: before, priorAssistantEvidence: { index: before - 1, quote: decision.priorEvidence }, completionStatus: 'accepted' });
      state.nextTurn = turn + 1;
      await persist();
      if (interruptAfter === turn) return { state, interrupted: true };
    }
    if (state.conversation.messages.some(m => m.role === 'user') && !state.feedback) {
      runtime.begin('feedback'); state.feedback = await runtime.request('/api/feedback', { conversationId: state.conversation.id });
      state.conversation = await runtime.detail(state.conversation.id);
      assert.equal(state.feedback.status, 200, 'Canonical feedback failed');
      assert.equal(state.feedback.data.text, state.conversation.feedbackText);
    }
    assert.deepEqual(await sourceHashes(root), Object.fromEntries(Object.entries(hashes).filter(([key]) => key !== 'settings')), 'Source changed during run');
    if (state.status === 'running') state.status = 'complete';
    const calls = await callRecords(out);
    state.evaluation = evaluateRun(state, scenario, calls, hashes);
    await persist();
    return { state, reused: false };
  } catch (error) {
    state.status = 'unknown'; state.error = error.message; state.bridgeErrors = runtime.errors;
    state.evaluation = evaluateRun(state, scenario, await callRecords(out), hashes);
    await persist(); throw error;
  } finally { onCleanup(await runtime.cleanup()); }
}
export async function report(base = join(root, '.omo/qa/purposeful')) {
  const { manifest } = await loadManifest(), current = await sourceHashes(root), summaries = [];
  for (const [variantId, variant] of Object.entries(variants)) {
    const rows = [];
    for (const scenario of manifest.scenarios) for (const runId of scenario.runIds) {
      const out = join(base, variantId, runId), state = await readRecord(join(out, 'state.json'));
      if (!state) { rows.push({ runId, status: 'missing', qualityPass: false }); continue; }
      const calls = await callRecords(out);
      const hashes = { ...current, settings: sha(JSON.stringify(settingsFor(variant))) };
      const evaluation = evaluateRun(state, scenario, calls, hashes);
      await saveRecord(join(out, 'evaluation.json'), evaluation);
      const known = calls.filter(c => c.body?.usage && isComplete(c.finish));
      let cost = 0, validUsage = true;
      for (const c of known) { try { cost += usageCost(c.payload.model, c.body.usage); } catch { validUsage = false; } }
      const candidateCalls = calls.filter(c => !c.reservationId.includes(':sim-'));
      rows.push({ runId, split: scenario.split, status: evaluation.status, qualityPass: false, hardFailures: evaluation.hardFailures.map(a => a.name), assertionArtifact: join(out, 'evaluation.json'), transcriptArtifact: join(out, 'state.json'), turns: state.conversation?.messages.filter(m => m.role === 'user').length || 0, calls: calls.length, knownUsageCalls: known.length, validUsage, knownCostUsd: cost, latencyMs: candidateCalls.map(c => c.latencyMs), hashes: state.hashes, unknownReservations: calls.filter(c => !c.body?.usage || !isComplete(c.finish)).map(c => c.reservationId) });
    }
    summaries.push({ variantId, status: rows.some(r => r.status === 'failed') ? 'failed' : rows.every(r => r.status === 'awaiting_blind_review') ? 'awaiting_blind_review' : 'not_established', qualityPass: false, expectedRuns: 14, completedRuns: rows.filter(r => ['failed', 'awaiting_blind_review'].includes(r.status)).length, rows });
  }
  const result = { generatedAt: new Date().toISOString(), status: 'not_established', qualityPass: false, manifest: 'scripts/fixtures/purposeful-scenarios.json', summaries, limits: ['No qualitative grade is inferred from deterministic coverage.', 'Independent reviewers must read complete synthetic trajectories with model names hidden and pair order swapped.', 'Missing required events, transcript, raw usage or matching hashes cannot pass.', 'No claim of real-world educational efficacy or human indistinguishability.'] };
  await saveRecord(join(base, 'report.json'), result);
  return result;
}
function argumentsFor(args) {
  const options = { mode: 'offline', model: 'luna-low', split: 'development', resume: false };
  let selected = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--validate', '--self-test', '--live', '--report'].includes(arg)) { assert.ok(!selected, 'Choose one mode'); selected = true; options.mode = arg.slice(2); }
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--model' || arg === '--split') { assert.ok(args[i + 1], 'Missing value'); options[arg.slice(2)] = args[++i]; }
    else assert.fail('Unknown argument');
  }
  assert.ok(Object.hasOwn(variants, options.model), 'Unknown model');
  assert.ok(['development', 'held_out', 'held-out'].includes(options.split), 'Unknown split');
  if (options.split === 'held-out') options.split = 'held_out';
  return options;
}
async function liveKeys(variant) {
  assert.equal(process.env.QA_LIVE, '1', '--live requires QA_LIVE=1');
  assert.ok(process.env.QA_ENV_FILE, 'Validated QA_ENV_FILE required');
  const credentialPath = await realpath(process.env.QA_ENV_FILE);
  assert.equal(credentialPath.toLowerCase().replaceAll('\\', '/'), 'c:/users/wish/downloads/gospel-conversation-simulator.env', 'Use the authorized credential file');
  const info = await stat(credentialPath); assert.ok(info.isFile() && info.size <= 128000, 'Invalid credential file');
  const parsed = parseEnv(await readFile(credentialPath, 'utf8'));
  const keys = Object.fromEntries(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'].filter(k => parsed[k]).map(k => [k, parsed[k]]));
  assert.ok(keys.OPENAI_API_KEY, 'OpenAI key required for blind simulator');
  assert.ok(keys[variant.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'], 'Candidate key missing');
  return keys;
}
export async function main(args = process.argv.slice(2)) {
  const options = argumentsFor(args), { manifest, validation } = await loadManifest();
  if (options.mode === 'validate') { console.log(JSON.stringify({ status: 'PASS', mode: 'offline_validation', executedScenarios: 12, ...validation })); return; }
  if (options.mode === 'report') { const result = await report(); console.log(JSON.stringify({ status: result.status, qualityPass: false, models: result.summaries.map(s => ({ model: s.variantId, status: s.status, completed: s.completedRuns, expected: s.expectedRuns })) })); return; }
  if (['self-test', 'offline'].includes(options.mode)) {
    const { selfTest } = await import('./purposeful-self-test.mjs'); const result = await selfTest();
    console.log(JSON.stringify(result)); return;
  }
  const keys = await liveKeys(variants[options.model]), budget = createBudget(root);
  assert.ok(budget.status().remainingUsd > 0, 'Budget exhausted');
  for (const scenario of manifest.scenarios.filter(s => s.split === options.split)) for (const runId of scenario.runIds) {
    const out = join(root, '.omo/qa/purposeful', options.model, runId);
    await runScenario({ manifest, scenario, runId, variantId: options.model, out, budget, transport: liveTransport(keys), resume: options.resume });
    console.log(JSON.stringify({ runId, status: 'recorded', remainingUsd: budget.status().remainingUsd }));
  }
  await report();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setImmediate(async () => { try { await main(); } catch (error) { console.error(JSON.stringify({ status: 'FAIL', error: error.message })); process.exitCode = 1; } });
}
