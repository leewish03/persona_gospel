import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { createBudget } from '../lib/qa-budget.js';
import { caller, liveTransport, readRecord, saveRecord, sourceHashes, settingsFor, variants, sha, startRuntime } from './purposeful-runtime.mjs';

assert.equal(process.env.QA_LIVE, '1');
const envPath = await realpath(process.env.QA_ENV_FILE);
assert.equal(envPath.replaceAll('\\', '/').toLowerCase(), 'c:/users/wish/downloads/gospel-conversation-simulator.env');
const [personaId, operation, message] = process.argv.slice(2);
const personas = JSON.parse(await readFile(new URL('../data/personas.json', import.meta.url), 'utf8'));
assert.ok(personas.some(persona => persona.id === personaId));
assert.ok(['start', 'chat', 'feedback'].includes(operation));
if (operation === 'chat') assert.ok(message?.trim());
const root = process.cwd();
const out = join(root, '.omo/qa/persona-long-2026-10-15/static-cache-v1', personaId);
const statePath = join(out, 'state.json');
let state = await readRecord(statePath);
const hashes = await sourceHashes(root);
hashes.runner = sha(await readFile(new URL(import.meta.url)));
const settings = settingsFor(variants['sol-balanced']);
if (state) {
  assert.notEqual(operation, 'start');
  assert.deepEqual(state.hashes, hashes);
  assert.equal(state.operations.at(-1).response.status, 200, 'Failed operation requires explicit investigation');
} else {
  assert.equal(operation, 'start');
  state = { synthetic: true, protocol: 'human-authored-adaptive-20-turn-v1', personaId, hashes, settings, conversation: null, operations: [] };
}
const budget = createBudget(root), beforeBudget = budget.status();
const call = caller({ budget, out, transport: liveTransport(parseEnv(await readFile(envPath, 'utf8'))), prefix: sha(out).slice(0, 20) });
const runtime = await startRuntime({ root, settings, conversation: state.conversation, call });
const id = operation + '-' + state.operations.length;
let response;
try {
  runtime.begin(id);
  const body = operation === 'start'
    ? { session: { personaId, relationship: 'casual_friend', setting: 'meal_after_group', goal: 'explain_gospel_core' } }
    : operation === 'chat'
      ? { conversationId: state.conversation.id, expectedMessageCount: state.conversation.messages.length, message: { role: 'user', content: message } }
      : { conversationId: state.conversation.id };
  response = await runtime.request('/api/' + operation, body);
  if (response.status === 200) state.conversation = await runtime.detail(response.data.conversationId || state.conversation.id);
  state.operations.push({ id, operation, message: message || null, response });
  await saveRecord(statePath, state);
  assert.deepEqual(await sourceHashes(root), Object.fromEntries(Object.entries(hashes).filter(([key]) => key !== 'runner')));
} finally {
  await saveRecord(join(out, id + '-receipt.json'), { cleanup: await runtime.cleanup(), beforeBudget, afterBudget: budget.status(), response });
}
console.log(JSON.stringify({ personaId, operation, response, remainingUsd: budget.status().remainingUsd }));
assert.equal(response.status, 200);
