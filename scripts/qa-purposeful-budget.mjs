import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createBudget, budgetedCall, LEGACY_PATHS, PRICING_VERSION, PRICING_SOURCES } from '../lib/qa-budget.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
assert.ok(process.argv.length === 3 && ['--status', '--self-test'].includes(mode), 'Use --status (read-only) or --self-test (offline fixtures).');
globalThis.fetch = () => { throw new Error('Offline budget CLI forbids network'); };
if (mode === '--status') {
  console.log(JSON.stringify({ ...createBudget(root).status(), pricingVersion: PRICING_VERSION, pricingSources: PRICING_SOURCES, readOnly: true }, null, 2));
} else {
  const tests = spawnSync(process.execPath, ['--test', 'lib/qa-budget.test.js'], { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.equal(tests.status, 0, tests.stdout + tests.stderr);
  const base = resolve(root, '.omo/tmp/task4'); mkdirSync(base, { recursive: true });
  const fixture = mkdtempSync(resolve(base, 'manual-'));
  let report;
  try {
    for (const path of LEGACY_PATHS) {
      const target = resolve(fixture, path); mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(resolve(root, path)));
    }
    const b = createBudget(fixture), before = b.status();
    let fixtureCalls = 0;
    const result = { status: 'completed', usage: { input_tokens: 100, output_tokens: 10 } };
    await budgetedCall(b, 'manual-fixture', { model: 'gpt-6-luna', inputTokenBound: 1000, maxOutputTokens: 100 }, async () => { fixtureCalls++; return result; });
    const journal = resolve(fixture, '.omo/qa/purposeful/budget-events.jsonl');
    const original = readFileSync(journal, 'utf8');
    const restarted = createBudget(fixture); restarted.settle('manual-fixture', result);
    assert.equal(readFileSync(journal, 'utf8'), original);
    assert.equal(restarted.status().newCalls, 1); assert.equal(fixtureCalls, 1);
    assert.deepEqual(before.snapshots, restarted.status().snapshots);
    report = { pass: true, mode: 'offline-fixture', scenarios: Number(tests.stdout.match(/# tests (\d+)/)?.[1]), networkCalls: 0, fixtureCalls, before, afterRestart: restarted.status(), journalEvents: original.trim().split('\n').map(JSON.parse).map(e => e.type === 'snapshot' ? { type: e.type, digest: e.digest, snapshots: e.legacy.snapshots, rows: e.legacy.rows.length } : e), testOutput: tests.stdout };
  } finally { rmSync(fixture, { recursive: true }); }
  assert.equal(existsSync(fixture), false);
  console.log(JSON.stringify({ ...report, cleanup: { fixtureRemoved: true, path: fixture } }, null, 2));
}
