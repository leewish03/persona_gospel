import test from 'node:test';
import assert from 'node:assert/strict';
import * as evaluation from './purposeful-evaluation.mjs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { root, loadManifest, runScenario } from './qa-persona-purposeful.mjs';

const messages = [{ role: 'assistant', content: '응, 지금은 괜찮아.' }];
const decision = { decision: 'continue', reply: '알겠어.', priorEvidence: '지금은 괜찮아.', boundary: 'none', consentScope: '현재 대화', reason: 'The current checkpoint was incorrectly treated as past.', checkpointDelivered: false, prerequisiteEvidence: [], topicChange: false, topicChangeConsent: null };
const scenario = { checkpoints: [{ turn: 5, fixedClause: '내 약속은 다음 주야.' }, { turn: 12, fixedClause: '아까 날짜는 잘못 말했어.' }, { turn: 23, fixedProbe: '내 약속은 언제라고 했지?' }] };
const delivered = [{ turn: 5, checkpointDelivered: true }, { turn: 12, checkpointDelivered: true }];

test('current recall is sent even when simulator incorrectly calls it past; no answer is inserted', () => {
  const result = evaluation.scheduleCheckpoint(decision, messages, scenario.checkpoints[2], scenario, delivered);
  assert.equal(result.reply, '내 약속은 언제라고 했지?');
  assert.equal(result.checkpointDelivered, true);
  assert.equal(result.deliverySource, 'controller-fixed-v3');
  evaluation.validateDecision(result, messages, scenario.checkpoints[2], 'main');
});
test('controller uses supplied new scenario wording rather than a memorized evaluation answer', () => {
  const checkpoint = { turn: 2, fixedClause: '우리 독서 모임은 수요일이야.' };
  assert.equal(evaluation.scheduleCheckpoint(decision, messages, checkpoint, { checkpoints: [checkpoint] }, []).reply, checkpoint.fixedClause);
});
test('global end and topic refusal never receive a forced checkpoint', () => {
  for (const boundary of ['global_end', 'topic_refusal']) {
    const input = { ...decision, boundary, ...(boundary === 'global_end' ? { decision: 'stop', reply: '' } : {}) };
    assert.equal(evaluation.scheduleCheckpoint(input, messages, scenario.checkpoints[2], scenario, delivered), input);
  }
});
test('missing earlier introduction cannot produce a false recall coverage pass', () => {
  assert.throws(() => evaluation.scheduleCheckpoint(decision, messages, scenario.checkpoints[2], scenario, []), /prerequisite/i);
});
test('controlled probes do not override explicit refusals missed by the simulator', () => {
  const checkpoint = scenario.checkpoints[0];
  for (const content of ['종교 이야기는 하고 싶지 않아.', '네 상담 얘기는 지금 듣고 싶지 않아. 내 얘기만 들어줘.']) {
    const history = [{ role: 'assistant', content }];
    const d = { ...decision, priorEvidence: content };
    assert.equal(evaluation.scheduleCheckpoint(d, history, checkpoint, scenario, []), d);
    const sent = evaluation.scheduleCheckpoint({ ...d, reply: checkpoint.fixedClause, checkpointDelivered: true }, history, checkpoint, scenario, []);
    assert.equal(sent.decision, 'stop'); assert.equal(sent.reply, ''); assert.equal(sent.checkpointDelivered, false);
  }
});
test('permission-dependent and ordinary turns retain response-conditioned decisions', () => {
  for (const checkpoint of [{ turn: 1 }, { turn: 2, fixedClause: '내 경험이야.', requires: 'permission' }]) {
    assert.equal(evaluation.scheduleCheckpoint(decision, messages, checkpoint, { checkpoints: [checkpoint] }, []), decision);
  }
});

test('earlier refusal survives unrelated turns and prevents forced recall', () => {
  for (const content of ['잠깐 이 얘기는 쉬자.', '취업이나 상담 얘기 말고 좀 가벼운 얘기 하자.']) {
    const history = [{ role: 'assistant', content }, { role: 'user', content: '그래.' }, ...messages];
    const checkpoint = scenario.checkpoints[2];
    assert.equal(evaluation.scheduleCheckpoint(decision, history, checkpoint, scenario, delivered), decision);
    const forced = evaluation.scheduleCheckpoint({ ...decision, reply: checkpoint.fixedProbe, checkpointDelivered: true }, history, checkpoint, scenario, delivered);
    assert.equal(forced.decision, 'stop');
    assert.equal(forced.checkpointDelivered, false);
  }
  assert.equal(evaluation.scheduleCheckpoint(decision, messages, scenario.checkpoints[2], scenario, [...delivered, { boundary: 'topic_refusal' }]), decision);
});

test('actual HTTP runtime delivers all three fixed events despite simulator declining every checkpoint', async () => {
  const base = resolve(root, '.omo/tmp/repair');
  await mkdir(base, { recursive: true });
  const out = await mkdtemp(join(base, 'scheduler-'));
  const { manifest } = await loadManifest();
  const scenario = manifest.scenarios.find(s => s.id === 'D1');
  const reserved = new Set(), settled = new Set(), cleanups = [];
  const budget = { reserve(id) { assert.ok(!reserved.has(id)); reserved.add(id); }, settle(id) { assert.ok(reserved.has(id)); settled.add(id); } };
  const feedback = '## 한줄 평가\n판단 근거가 부족합니다.\n## 관찰한 강점\n판단 근거가 부족합니다.\n## 다음에 바꿔볼 점\n판단 근거가 부족합니다.\n## 문제 발화 교정\n판단 근거가 부족합니다.\n## 다음 훈련 과제\n- 다음 대화에서 상대가 중요하게 여긴 점을 한 문장으로 확인해보세요.';
  try {
    const options = { manifest, scenario, runId: 'D1-main', variantId: 'luna-production', checkpointPolicy: 'controller-fixed-v3', out, budget,
      fixtureSimulator(projection) { return { ...decision, priorEvidence: projection.transcript.at(-1).content }; },
      async transport(provider, payload) {
        assert.equal(provider, 'openai');
        const semantic = payload.instructions?.includes('피드백 의미 검증자');
        const claims = semantic ? JSON.parse(payload.input.split('검증 항목 (JSON, 모든 index를 한 번씩 판정):\n')[1]) : [];
        const text = semantic ? JSON.stringify({ checks: claims.map(c => ({ claimIndex: c.index, owner: '해당 없음', sourceIndexes: [0], contradictingIndexes: [], verdict: 'supported', reason: '제어 흐름만 검증하는 고정 응답' })) }) : payload.model === 'gpt-5.4' ? feedback : '응, 지금은 괜찮아.';
        return { status: 200, body: { status: 'completed', output_text: text, usage: { input_tokens: 100, output_tokens: 50 } } };
      }, onCleanup: c => cleanups.push(c) };
    const interrupted = await runScenario({ ...options, interruptAfter: 4 });
    assert.equal(interrupted.state.nextTurn, 5);
    await assert.rejects(runScenario({ ...options, resume: true, checkpointPolicy: 'response-conditioned-v1' }), /checkpoint policy changed/);
    const result = await runScenario({ ...options, resume: true });
    assert.equal(result.state.conversation.messages.length, 49);
    for (const checkpoint of scenario.checkpoints.filter(c => c.eventId)) {
      const accepted = result.state.decisions.find(d => d.turn === checkpoint.turn);
      assert.equal(accepted.reply, checkpoint.fixedClause || checkpoint.fixedProbe);
      assert.equal(accepted.eventId, checkpoint.eventId);
      assert.equal(accepted.deliverySource, 'controller-fixed-v3');
    }
    assert.equal(result.state.evaluation.assertions.find(a => a.name === 'required_events').status, 'pass');
    assert.equal(result.state.evaluation.qualityPass, false);
    assert.deepEqual(result.state.evaluation.rawAttemptFailures, []);
    assert.equal(reserved.size, 27); assert.equal(settled.size, 27);
    assert.equal(cleanups.length, 2); assert.ok(cleanups.every(c => c.temporaryDirectoryRemoved));
    const original = await runScenario({ ...options, checkpointPolicy: undefined, out: join(out, 'original'), interruptAfter: 5 });
    assert.equal(original.state.checkpointPolicy, 'response-conditioned-v1');
    assert.equal(original.state.decisions[4].reply, decision.reply);
    assert.equal(original.state.decisions[4].checkpointDelivered, false);
    assert.equal(cleanups.length, 3); assert.ok(cleanups.every(c => c.temporaryDirectoryRemoved));
  } finally {
    assert.ok(out.startsWith(base + sep));
    await rm(out, { recursive: true, force: true });
  }
});
