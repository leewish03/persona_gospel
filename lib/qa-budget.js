import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, openSync, closeSync, writeSync, fsyncSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const LEGACY_PATHS = ['.omo/qa/live/budget.json', '.omo/qa/models/budget.json', '.omo/qa/browser-budget.json'];
export const LEGACY_SNAPSHOTS = [
  { path: LEGACY_PATHS[0], sha256: '46c7cfad39a70c09b0b4dc1bbe2cf8fa0f1692f0ef5713da7f4a3cc74b48dba9', rowCount: 181 },
  { path: LEGACY_PATHS[1], sha256: 'f8a81faf74fca879b3b984f3a5cd4ff167ad2d1d46293604fb8e505ad4e484f6', rowCount: 192 },
  { path: LEGACY_PATHS[2], sha256: 'bcdf16087f595f39a4ed8359bc4f4936033c77a4da53ac3128bc140a221b7b14', rowCount: 14 }
];
export const PRICING_VERSION = 'standard-text-2026-10-15';
// Verified official model pages on 2026-10-15; standard text only, no tools or premium processing.
export const PRICING_SOURCES = [
  'https://developers.openai.com/api/docs/models/gpt-6-luna',
  'https://developers.openai.com/api/docs/models/gpt-6.1-sol',
  'https://developers.openai.com/api/docs/models/gpt-5.4-mini',
  'https://developers.openai.com/api/docs/models/gpt-5.4',
  'https://platform.claude.com/docs/en/models/haiku-5-5/overview'
];
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nano = value => Math.ceil(value * 1e9 - 1e-7);
function count(value) { assert.ok(Number.isSafeInteger(value) && value >= 0, 'Invalid token count'); return value; }
function money(value) { assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'Invalid money'); return value; }
function rates(model, input) {
  if (model === 'gpt-6.1-sol') return input > 272000 ? [4, .2, 5, 15] : [2, .1, 2.5, 10];
  if (model === 'gpt-6-luna') return input > 272000 ? [.2, .02, .25, .75] : [.1, .01, .125, .5];
  if (model === 'gpt-5.4-mini') return [.75, .075, .75, 4.5];
  if (model === 'gpt-5.4') return input > 272000 ? [5, .5, 5, 22.5] : [2.5, .25, 2.5, 15];
  if (model === 'claude-haiku-5-5') return input > 100000 ? [.5, .05, 1, 2.5] : [.1, .01, .2, .5];
  throw new Error('Unknown model pricing');
}
export function usageCost(model, usage) {
  assert.ok(usage && typeof usage === 'object', 'Missing raw usage');
  const input = count(usage.input_tokens), output = count(usage.output_tokens);
  const anthropic = model === 'claude-haiku-5-5';
  const cached = count(anthropic ? usage.cache_read_input_tokens ?? 0 : usage.input_tokens_details?.cached_tokens ?? 0);
  const created = count(anthropic ? usage.cache_creation_input_tokens ?? 0 : usage.input_tokens_details?.cache_write_tokens ?? 0);
  const reasoning = count(usage.output_tokens_details?.reasoning_tokens ?? 0);
  assert.ok(reasoning <= output, 'Reasoning exceeds billed output');
  if (!anthropic) assert.ok(cached + created <= input, 'Cache exceeds input');
  if (usage.total_tokens !== undefined) assert.equal(count(usage.total_tokens), input + output + (anthropic ? cached + created : 0), 'Inconsistent token total');
  const [ip, cp, wp, op] = rates(model, input + (anthropic ? cached + created : 0));
  // An absent Anthropic TTL is charged at the higher 1h rate, never guessed as 5m.
  let writeCost = created * wp;
  if (anthropic && usage.cache_creation) {
    const short = count(usage.cache_creation.ephemeral_5m_input_tokens ?? 0);
    const long = count(usage.cache_creation.ephemeral_1h_input_tokens ?? 0);
    assert.equal(short + long, created, 'Inconsistent cache TTL counts');
    writeCost = short * ip * 1.25 + long * ip * 2;
  }
  return nano(((input - (anthropic ? 0 : cached + created)) * ip + cached * cp + writeCost + output * op) / 1e6) / 1e9;
}
export function reservationCost({ model, inputTokenBound, maxOutputTokens }) {
  count(inputTokenBound); count(maxOutputTokens);
  assert.ok(inputTokenBound > 0 && maxOutputTokens > 0, 'Positive request bounds required');
  const [ip, , wp, op] = rates(model, inputTokenBound);
  return nano((inputTokenBound * Math.max(ip, wp) + maxOutputTokens * op) / 1e6) / 1e9;
}
function legacyModel(path, row) {
  if (row.model) return row.model;
  if (path === LEGACY_PATHS[0]) return 'gpt-5.4-mini';
  if (row.variant?.startsWith('mini-')) return 'gpt-5.4-mini';
  if (row.variant?.startsWith('luna-')) return 'gpt-6-luna';
  if (row.variant?.startsWith('haiku-')) return 'claude-haiku-5-5';
  return 'unknown';
}
function legacyMoney(record, fields, fallback) {
  const values = fields.filter(field => Object.hasOwn(record, field)).map(field => money(record[field]));
  if (!values.length) return money(fallback);
  assert.ok(values.every(value => value === values[0]), 'Contradictory legacy money aliases');
  return values[0];
}
function legacyCurrency(record) {
  if (Object.hasOwn(record, 'currency')) assert.equal(record.currency, 'USD', 'Unsupported legacy currency');
}
export function readLegacy(root) {
  const snapshots = [], rows = [];
  for (const path of LEGACY_PATHS) {
    const bytes = readFileSync(resolve(root, path));
    const ledger = JSON.parse(bytes);
    assert.ok(Array.isArray(ledger.calls), 'Invalid legacy ledger');
    legacyCurrency(ledger);
    let reserved = 0, billed = 0;
    ledger.calls.forEach((row, index) => {
      legacyCurrency(row);
      const reserve = legacyMoney(row, ['reservedUsd', 'reserve']);
      reserved += reserve;
      billed += legacyMoney(row, ['billedUsd', 'cost'], 0);
      const model = legacyModel(path, row);
      let cost = reserve, settled = false, reason = 'unresolved-status';
      if (['completed', 'end_turn', 'stop_sequence', 200].includes(row.status)) {
        try {
          const provider = model.startsWith('gpt-') ? 'openai' : model.startsWith('claude-') ? 'anthropic' : null;
          for (const record of [ledger, row]) {
            if (Object.hasOwn(record, 'provider')) assert.equal(record.provider, provider, 'Unknown or mismatched legacy provider');
          }
          cost = usageCost(model, row.usage); settled = true; reason = 'valid-usage';
        }
        catch (error) { reason = error.message; }
      }
      rows.push({ id: `${path}:${index}:${hash(JSON.stringify(row))}`, model, reservedUsd: reserve, costUsd: cost, settled, reason });
    });
    assert.ok(Math.abs(reserved - money(ledger.reservedUsd)) < 1e-9, 'Contradictory legacy reserved total');
    if (Object.hasOwn(ledger, 'billedUsd') || Object.hasOwn(ledger, 'cost')) assert.ok(Math.abs(billed - legacyMoney(ledger, ['billedUsd', 'cost'])) < 1e-9, 'Contradictory legacy billed total');
    snapshots.push({ path, sha256: hash(bytes), rowCount: ledger.calls.length });
  }
  return { snapshots, rows };
}
export function createBudget(root, expectedSnapshots = LEGACY_SNAPSHOTS) {
  root = resolve(root);
  const journal = resolve(root, '.omo/qa/purposeful/budget-events.jsonl');
  const lock = `${journal}.lock`;
  function read() {
    const legacy = readLegacy(root);
    assert.ok(same(legacy.snapshots, expectedSnapshots), 'Historical snapshot mismatch');
    let text = '';
    try { text = readFileSync(journal, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    assert.ok(!text || text.endsWith('\n'), 'Interrupted journal; manual reconciliation required');
    const events = text ? text.trimEnd().split('\n').map(line => JSON.parse(line)) : [];
    let prev = ''; const calls = new Map();
    events.forEach((event, index) => {
      const { digest, ...body } = event;
      assert.equal(body.previous, prev, 'Broken journal chain');
      assert.equal(digest, hash(JSON.stringify(body)), 'Altered journal event');
      prev = digest;
      if (index === 0) {
        assert.equal(event.type, 'snapshot');
        assert.equal(event.pricingVersion, PRICING_VERSION);
        assert.ok(same(event.legacy, legacy), 'Historical ledger or settlement changed');
      } else if (event.type === 'reserve') {
        assert.ok(typeof event.id === 'string' && event.id.length > 0 && !calls.has(event.id), 'Duplicate reservation');
        assert.equal(event.reservedUsd, reservationCost(event.request));
        calls.set(event.id, { ...event, costUsd: event.reservedUsd, settled: false });
      } else if (event.type === 'result') {
        const row = calls.get(event.id);
        assert.ok(row && !row.result, 'Duplicate or orphan settlement');
        const cost = event.usage && ['completed', 'end_turn', 'stop_sequence'].includes(event.status) ? usageCost(row.request.model, event.usage) : null;
        assert.equal(event.costUsd, cost);
        row.result = event;
        if (cost !== null) { row.costUsd = cost; row.settled = true; }
      } else assert.fail('Unknown journal event');
    });
    const all = [...legacy.rows, ...calls.values()];
    const settledNano = all.filter(r => r.settled).reduce((s, r) => s + nano(r.costUsd), 0);
    const uncertainNano = all.filter(r => !r.settled).reduce((s, r) => s + nano(r.costUsd), 0);
    return { legacy, events, calls, previous: prev, summary: { limitUsd: 5, settledUsd: settledNano / 1e9, uncertainUsd: uncertainNano / 1e9, accountedUsd: (settledNano + uncertainNano) / 1e9, remainingUsd: (5e9 - settledNano - uncertainNano) / 1e9, legacyRows: legacy.rows.length, newCalls: calls.size, snapshots: legacy.snapshots } };
  }
  function append(state, body) {
    const event = { ...body, previous: state.previous };
    const digest = hash(JSON.stringify(event));
    const fd = openSync(journal, 'a');
    try { writeSync(fd, JSON.stringify({ ...event, digest }) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    state.previous = digest;
  }
  function mutate(fn) {
    mkdirSync(dirname(journal), { recursive: true });
    let fd;
    try { fd = openSync(lock, 'wx'); } catch (e) { if (e.code === 'EEXIST') throw new Error('Budget lock held; interrupted locks require manual reconciliation'); throw e; }
    try {
      const state = read();
      if (!state.events.length) append(state, { type: 'snapshot', pricingVersion: PRICING_VERSION, legacy: state.legacy });
      return fn(state);
    } finally { closeSync(fd); unlinkSync(lock); }
  }
  return {
    status: () => read().summary,
    reserve(id, request) {
      assert.ok(typeof id === 'string' && /^[\w:.-]{1,200}$/.test(id), 'Invalid call ID');
      const reservedUsd = reservationCost(request);
      return mutate(state => {
        assert.ok(!state.calls.has(id), 'Call ID already reserved; never resend an uncertain call');
        assert.ok(nano(state.summary.accountedUsd) + nano(reservedUsd) <= 5e9, 'Cumulative USD 5 QA budget exhausted');
        append(state, { type: 'reserve', id, request, reservedUsd });
        return { id, reservedUsd };
      });
    },
    settle(id, { status, usage = null }) {
      return mutate(state => {
        const row = state.calls.get(id);
        assert.ok(row, 'No reservation');
        let costUsd = null;
        if (usage && ['completed', 'end_turn', 'stop_sequence'].includes(status)) costUsd = usageCost(row.request.model, usage);
        const body = { type: 'result', id, status, usage, costUsd };
        if (row.result) {
          const { previous, digest, ...prior } = row.result;
          assert.ok(same(prior, body), 'Contradictory duplicate settlement');
          return { id, costUsd };
        }
        append(state, body);
        return { id, costUsd };
      });
    }
  };
}
export async function budgetedCall(budget, id, request, call) {
  budget.reserve(id, request);
  const result = await call();
  budget.settle(id, result);
  return result;
}
export function refuseLegacyPaidQa() {
  throw new Error('Legacy paid QA disabled: migrate to lib/qa-budget.js and scripts/qa-persona-purposeful.mjs; inspect node scripts/qa-purposeful-budget.mjs --status. No network call was authorized.');
}
