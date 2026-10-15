import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createBudget, usageCost, reservationCost, budgetedCall, LEGACY_PATHS, readLegacy } from './qa-budget.js';

const snapshots = new Map();
const fixtureBudget = root => createBudget(root, snapshots.get(root));
const request = { model: 'gpt-6-luna', inputTokenBound: 1000, maxOutputTokens: 100 };
const usage = { input_tokens: 100, output_tokens: 10 };
function fixture(t, rows = []) {
  const base = resolve('.omo/tmp/task4'); mkdirSync(base, { recursive: true });
  const root = mkdtempSync(resolve(base, 'budget-'));
  for (const [i, path] of LEGACY_PATHS.entries()) {
    const calls = i === 0 ? rows : [];
    const file = resolve(root, path); mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ reservedUsd: calls.reduce((s, r) => s + r.reservedUsd, 0), calls }));
  }
  snapshots.set(root, readLegacy(root).snapshots);
  t.after(() => rmSync(root, { recursive: true }));
  return root;
}
test('pricing includes reasoning once, cache subsets, TTL and full-request long tiers', () => {
  assert.equal(usageCost('gpt-6-luna', { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 600 }, output_tokens_details: { reasoning_tokens: 80 } }), .000147);
  assert.equal(usageCost('gpt-6-luna', { input_tokens: 272000, output_tokens: 100 }), .02725);
  assert.equal(usageCost('gpt-6-luna', { input_tokens: 272001, output_tokens: 100 }), .0544752);
  assert.equal(usageCost('claude-haiku-5-5', { input_tokens: 99000, output_tokens: 100, cache_read_input_tokens: 1001 }), .04980005);
  assert.equal(usageCost('claude-haiku-5-5', { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 1000 }), .00026);
  assert.equal(usageCost('claude-haiku-5-5', { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 1000 } }), .000185);
  assert.equal(usageCost('gpt-5.4', { input_tokens: 272001, output_tokens: 100 }), 1.362255);
  assert.equal(reservationCost(request), .000175);
  assert.equal(usageCost('gpt-6.1-sol', { input_tokens: 1000, output_tokens: 100, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 600 } }), .00292);
  assert.equal(usageCost('gpt-6.1-sol', { input_tokens: 272001, output_tokens: 100 }), 1.089504);
  assert.equal(reservationCost({ model: 'gpt-6.1-sol', inputTokenBound: 1000, maxOutputTokens: 100 }), .0035);
});
test('invalid usage and unknown pricing cannot settle', () => {
  for (const u of [null, {}, { input_tokens: -1, output_tokens: 1 }, { input_tokens: Infinity, output_tokens: 1 }, { input_tokens: NaN, output_tokens: 1 }, { input_tokens: '1', output_tokens: 1 }, { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 2 } }, { input_tokens: 1, output_tokens: 1, total_tokens: 3 }, { input_tokens: 1, output_tokens: 1, output_tokens_details: { reasoning_tokens: 2 } }]) assert.throws(() => usageCost('gpt-6-luna', u));
  assert.throws(() => usageCost('unknown', usage));
});
test('immutable legacy identities, settlement, restart and duplicate settlement are idempotent', t => {
  const root = fixture(t, [{ reservedUsd: .1, status: 'completed', usage }, { reservedUsd: .2, status: 'reserved' }]);
  const before = LEGACY_PATHS.map(p => readFileSync(resolve(root, p), 'utf8'));
  const b = fixtureBudget(root); const first = b.status();
  assert.equal(first.uncertainUsd, .2); assert.equal(first.settledUsd, .00012);
  b.reserve('one', request); b.settle('one', { status: 'completed', usage });
  const journal = resolve(root, '.omo/qa/purposeful/budget-events.jsonl'); const bytes = readFileSync(journal, 'utf8');
  fixtureBudget(root).settle('one', { status: 'completed', usage });
  assert.equal(readFileSync(journal, 'utf8'), bytes);
  assert.equal(fixtureBudget(root).status().settledUsd, .000135);
  assert.deepEqual(LEGACY_PATHS.map(p => readFileSync(resolve(root, p), 'utf8')), before);
  assert.throws(() => b.settle('one', { status: 'completed', usage: { ...usage, output_tokens: 11 } }), /duplicate/);
});
test('missing usage, unknown model and bad legacy usage retain original reservations', t => {
  const root = fixture(t, [
    { reservedUsd: .1, status: 'completed' },
    { reservedUsd: .2, status: 'completed', model: 'unknown', usage },
    { reservedUsd: .3, status: 'completed', usage: { input_tokens: -1, output_tokens: 10 } }
  ]);
  assert.equal(fixtureBudget(root).status().uncertainUsd, .6);
});
test('cap, corrupted history, invalid request and interrupted calls refuse before network', async t => {
  const root = fixture(t, [{ reservedUsd: 5, status: 'reserved' }]); let calls = 0;
  const network = async () => { calls++; return { status: 'completed', usage }; };
  const b = fixtureBudget(root);
  await assert.rejects(budgetedCall(b, 'cap', request, network), /exhausted/);
  await assert.rejects(budgetedCall(b, 'unknown', { ...request, model: 'unknown' }, network));
  for (const value of [-1, NaN, Infinity]) await assert.rejects(budgetedCall(b, 'invalid', { ...request, inputTokenBound: value }, network));
  const path = resolve(root, LEGACY_PATHS[0]); const j = JSON.parse(readFileSync(path)); j.calls[0].status = 'completed'; writeFileSync(path, JSON.stringify(j));
  await assert.rejects(budgetedCall(b, 'changed', request, network), /Historical/);
  assert.equal(calls, 0);
});
test('unknown outcomes and partial journal retain spend and forbid resend', async t => {
  const root = fixture(t); const b = fixtureBudget(root); let calls = 0;
  await assert.rejects(budgetedCall(b, 'timeout', request, async () => { calls++; throw new Error('timeout'); }));
  assert.equal(fixtureBudget(root).status().uncertainUsd, reservationCost(request));
  await assert.rejects(budgetedCall(fixtureBudget(root), 'timeout', request, async () => { calls++; }));
  b.reserve('missing', request); b.settle('missing', { status: 'completed' });
  assert.equal(b.status().uncertainUsd, reservationCost(request) * 2);
  assert.equal(calls, 1);
  const file = resolve(root, '.omo/qa/purposeful/budget-events.jsonl'); writeFileSync(file, readFileSync(file, 'utf8') + '{');
  await assert.rejects(budgetedCall(b, 'partial', request, async () => { calls++; }), /Interrupted/);
  assert.equal(calls, 1);
});
test('exclusive lock and interrupted lock fail closed', async t => {
  const root = fixture(t); const dir = resolve(root, '.omo/qa/purposeful'); mkdirSync(dir, { recursive: true });
  const lock = resolve(dir, 'budget-events.jsonl.lock'); writeFileSync(lock, '');
  let calls = 0;
  await assert.rejects(budgetedCall(fixtureBudget(root), 'locked', request, async () => { calls++; }), /lock/);
  assert.equal(calls, 0); assert.ok(existsSync(lock));
});
test('two processes compete for the final allowance, at most one reserves', async t => {
  const root = fixture(t, [{ reservedUsd: 4.9998, status: 'reserved' }]);
  const moduleUrl = new URL('./qa-budget.js', import.meta.url).href;
  const run = id => new Promise(resolveResult => {
    const code = `import {createBudget} from ${JSON.stringify(moduleUrl)}; try {createBudget(${JSON.stringify(root)},${JSON.stringify(snapshots.get(root))}).reserve(${JSON.stringify(id)},${JSON.stringify(request)});process.exit(0)}catch{process.exit(2)}`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: 'ignore' });
    child.on('error', error => resolveResult(error)); child.on('exit', code => resolveResult(code));
  });
  const results = await Promise.all([run('a'), run('b')]);
  assert.equal(results.filter(x => x === 0).length, 1);
  assert.equal(fixtureBudget(root).status().newCalls, 1);
  assert.ok(fixtureBudget(root).status().accountedUsd <= 5);
});
test('legacy total contradictions refuse before any reservation', t => {
  const root = fixture(t); const path = resolve(root, LEGACY_PATHS[0]);
  writeFileSync(path, JSON.stringify({ reservedUsd: 1, calls: [] }));
  assert.throws(() => fixtureBudget(root).reserve('bad', request), /Contradictory/);
});
test('legacy paid entrypoints refuse with network spy and no credentials', () => {
  for (const file of ['scripts/qa-persona-live.mjs', 'scripts/qa-persona-models.mjs', 'scripts/qa-roleplay.mjs', 'scripts/qa-interactive-roleplay.mjs', 'scripts/qa-claude-personas.mjs', 'scripts/qa-full-walkthrough.mjs', '.omo/qa/browser-budget.mjs', '.omo/qa/release-browser.mjs']) {
    const url = new URL(`../${file}`, import.meta.url).href;
    const code = `globalThis.fetch=()=>{throw new Error('NETWORK_SPY_CALLED')}; try{await import(${JSON.stringify(url)})}catch(e){if(!e.message.includes('Legacy paid QA disabled'))throw e; console.log('REFUSED_BEFORE_NETWORK')}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`); assert.match(result.stdout, /REFUSED_BEFORE_NETWORK/);
  }
});

test('a changed history is refused even before the first journal exists', async t => {
  const root = fixture(t, [{ reservedUsd: .1, status: 'reserved' }]);
  const file = resolve(root, LEGACY_PATHS[0]); const data = JSON.parse(readFileSync(file));
  data.calls[0].status = 'completed'; writeFileSync(file, JSON.stringify(data));
  let network = 0;
  await assert.rejects(budgetedCall(fixtureBudget(root), 'changed-first', request, async () => { network++; }), /Historical snapshot/);
  assert.equal(network, 0);
});
test('process termination after durable reservation keeps the charge on restart', async t => {
  const root = fixture(t);
  const moduleUrl = new URL('./qa-budget.js', import.meta.url).href;
  const code = `import {createBudget} from ${JSON.stringify(moduleUrl)};createBudget(${JSON.stringify(root)},${JSON.stringify(snapshots.get(root))}).reserve('terminated',${JSON.stringify(request)});console.log('RESERVED');setInterval(()=>{},1000)`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('child did not reserve')); }, 5000);
    child.stdout.once('data', bytes => { clearTimeout(timer); assert.match(String(bytes), /RESERVED/); resolveReady(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
  const stopped = new Promise(resolveExit => child.once('exit', resolveExit)); child.kill('SIGKILL'); await stopped;
  assert.equal(fixtureBudget(root).status().uncertainUsd, reservationCost(request));
  assert.throws(() => fixtureBudget(root).reserve('terminated', request), /already reserved/);
});

test('legacy settlement retains unknown or mismatched explicit providers', t => {
  const root = fixture(t, [
    { reservedUsd: 1, model: 'gpt-6-luna', provider: 'unknown-provider', status: 'completed', usage },
    { reservedUsd: 1, model: 'gpt-6-luna', provider: 'anthropic', status: 'completed', usage },
    { reservedUsd: 1, model: 'claude-haiku-5-5', provider: 'openai', status: 'completed', usage }
  ]);
  assert.equal(fixtureBudget(root).status().uncertainUsd, 3);
  assert.equal(readLegacy(root).rows.filter(row => row.settled).length, 0);
  const file = resolve(root, LEGACY_PATHS[0]); const ledger = JSON.parse(readFileSync(file));
  ledger.provider = 'unknown-provider'; ledger.calls = [{ reservedUsd: 1, model: 'gpt-6-luna', status: 'completed', usage }]; ledger.reservedUsd = 1;
  writeFileSync(file, JSON.stringify(ledger));
  assert.equal(readLegacy(root).rows[0].settled, false);
});
test('contradictory monetary aliases and non-USD currency fail closed before network', async t => {
  const root = fixture(t, [{ reservedUsd: 1, model: 'gpt-6-luna', status: 'completed', usage }]);
  const file = resolve(root, LEGACY_PATHS[0]); const original = JSON.parse(readFileSync(file));
  let network = 0;
  for (const [rowPatch, ledgerPatch] of [
    [{ billedUsd: .9, cost: .8 }, {}], [{ billedUsd: .9, cost: -1 }, {}],
    [{ reservedUsd: 1, reserve: null }, {}], [{ currency: 'KRW' }, {}],
    [{}, { currency: 'EUR' }], [{}, { billedUsd: 0, cost: .1 }]
  ]) {
    const ledger = structuredClone(original); Object.assign(ledger.calls[0], rowPatch); Object.assign(ledger, ledgerPatch);
    writeFileSync(file, JSON.stringify(ledger));
    assert.throws(() => readLegacy(root), /money|Contradictory|currency/i);
    await assert.rejects(budgetedCall(fixtureBudget(root), 'invalid-record', request, async () => { network++; }));
  }
  assert.equal(network, 0);
});
test('consistent USD money aliases and matching provider preserve valid settlement', t => {
  const root = fixture(t, [{ reservedUsd: 1, reserve: 1, billedUsd: .000015, cost: .000015, currency: 'USD', provider: 'openai', model: 'gpt-6-luna', status: 'completed', usage }]);
  assert.equal(fixtureBudget(root).status().settledUsd, .000015);
  assert.equal(fixtureBudget(root).status().uncertainUsd, 0);
});
