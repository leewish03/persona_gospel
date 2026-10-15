import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createBudget, LEGACY_PATHS } from '../lib/qa-budget.js';
import { root, loadManifest, runScenario, callRecords, report, main } from './qa-persona-purposeful.mjs';
import { caller, readRecord, saveRecord, sha, sourceHashes, settingsFor, variants } from './purposeful-runtime.mjs';
import { evaluateRun, simulatorInput, validateDecision, validateManifest, simulatorInstructions } from './purposeful-evaluation.mjs';

const feedbackFor = quote => '## 한줄 평가\n상대의 말을 확인했습니다.\n## 관찰한 강점\n- 질문했습니다. 근거 [사용자 1]: "' + quote + '"\n## 다음에 바꿔볼 점\n판단 근거가 부족합니다.\n## 문제 발화 교정\n판단 근거가 부족합니다.\n## 다음 훈련 과제\n- 다음 대화에서 들은 말을 한 문장으로 되짚어 말해보세요.';
export async function selfTest({ injectSuiteFailure = false } = {}) {
  const evidence = join(root, '.omo/evidence/purposeful-persona-training');
  const tempBase = join(root, '.omo/tmp/task6'); await mkdir(tempBase, { recursive: true }); await mkdir(evidence, { recursive: true });
  const temp = await mkdtemp(join(tempBase, 'test-'));
  const artifacts = join(root, '.omo/qa/purposeful/fixtures/task6');
  const results = [], cleanups = [];
  let networkCalls = 0, completed = false, failure = null;
  const before = Object.fromEntries(await Promise.all(LEGACY_PATHS.map(async f => [f, sha(await readFile(join(root, f)))])));
  for (const f of LEGACY_PATHS) { await mkdir(dirname(join(temp, f)), { recursive: true }); await cp(join(root, f), join(temp, f)); }
  const budget = createBudget(temp), initialBudget = budget.status();
  const { manifest, validation } = await loadManifest();
  const fixtureProvider = createServer(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    const fixture = JSON.parse(text);
    if (fixture.timeout) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(fixture.body));
  });
  fixtureProvider.listen(0, '127.0.0.1'); await once(fixtureProvider, 'listening');
  const endpoint = 'http://127.0.0.1:' + fixtureProvider.address().port;
  async function check(name, action) {
    await action(); results.push({ scenario: name, invocation: 'node scripts/qa-persona-purposeful.mjs --self-test', observable: 'All assertions for this scenario completed; a violation throws and exits nonzero.', artifact: '.omo/qa/purposeful/fixtures/task6', passed: true }); console.log('PASS ' + name);
  }
  const paths = {};
  async function execute(name, scenarioId, defect = '', variantId = 'luna-low', extra = {}) {
    const scenario = manifest.scenarios.find(s => s.id === scenarioId);
    const out = paths[name] || join(temp, 'runs', name); paths[name] = out;
    let turn = 0, firstUser = '', sent = 0;
    const simulator = (projection, checkpoint, state) => {
      turn = checkpoint.turn;
      const last = state.conversation.messages.at(-1).content;
      const fixed = checkpoint.fixedClause || checkpoint.fixedProbe;
      let reply = defect === 'ignored-refusal' && turn === 20 ? '내 얘기는 다른 사람에게 전하지 마.' : fixed || ('"' + last.slice(0, 20) + '"라는 말이구나. 조금 더 말해줄래?');
      if (turn === 1) firstUser = reply;
      else firstUser ||= state.conversation.messages.find(m => m.role === 'user')?.content;
      const branchObserved = checkpoint.branches && /교회 초대 이야기는 하지/.test(last);
      if (branchObserved) reply = extra.branch === 'pressure' ? '오늘 초대는 결정해 주면 안 될까?' : '알겠어. 초대 이야기는 하지 않을게. 네가 말한 일상 이야기를 들을게.';
      return { decision: 'continue', reply, priorEvidence: last.slice(0, 20), boundary: branchObserved ? 'topic_refusal' : 'none', consentScope: '현재 대화', reason: 'Actual previous reply quoted by offline fixture', checkpointDelivered: branchObserved || !checkpoint.requires && !checkpoint.branches, prerequisiteEvidence: branchObserved ? [{ index: state.conversation.messages.length - 1, quote: last }] : [], topicChange: false, topicChangeConsent: null };
    };
    const prompt = await readFile(join(root, 'prompts/persona-system-prompt.md'), 'utf8');
    const transport = async (provider, payload) => {
      networkCalls++; sent++;
      if (payload.instructions === simulatorInstructions) {
        const projection = JSON.parse(payload.input);
        const decision = simulator(projection, projection.checkpoint, { conversation: { messages: projection.transcript } });
        const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ body: { status: 'completed', output_text: JSON.stringify(decision), usage: { input_tokens: 100, output_tokens: 80 } } }), signal: AbortSignal.timeout(10000) });
        return { status: response.status, body: await response.json() };
      }
      const input = provider === 'openai' ? payload.input : payload.messages[0].content;
      const feedback = input.includes('[사용자 1]:');
      if (!feedback) {
        assert.equal(provider === 'openai' ? payload.instructions : payload.system[0].text, prompt, 'Real runtime local prompt');
        assert.equal(payload.model, variants[variantId].model);
        assert.equal(provider === 'openai' ? payload.reasoning.effort : payload.output_config.effort, 'low');
        if (turn === 23 && scenarioId === 'D1') {
          assert.ok(input.includes(scenario.checkpoints[4].fixedClause), 'Middle introduction retained in real runtime input');
          assert.ok(input.includes(scenario.checkpoints[11].fixedClause), 'Correction retained in real runtime input');
        }
      }
      let text = feedback ? feedbackFor(defect === 'fabricated-quote' ? '존재하지 않는 합성 발언' : firstUser) : turn === 0 ? '오늘 카페가 조용하네. 요즘 마음에 남는 일이 있어?' : '방금 말한 이야기를 조금 더 생각하고 싶어.';
      if (!feedback && turn === 5 && scenarioId === 'D3') text = '교회 초대 이야기는 하지 말아줘. 일상 이야기는 괜찮아.';
      if (!feedback && turn === 23 && scenarioId === 'D1') text = '네 이직 상담은 동기 지수와 11월 9일이야.';
      if (!feedback && defect === 'wrong-speaker' && turn === 23) text = '내 이직 상담은 동기 지수와 11월 9일이야.';
      if (!feedback && defect === 'corrected-date' && turn === 23) text = '네 이직 상담은 사촌 유라와 11월 6일이야.';
      if (!feedback && defect === 'changed-promise' && turn === 24) text = '12월 4일 저녁에 자기소개서를 보내 주기로 했지.';
      if (!feedback && defect === 'unknown-fact' && turn === 22) text = '김철수 교수님께 지도받았지.';
      if (!feedback && defect === 'ignored-refusal' && turn === 20) text = '네 이야기는 내 친구에게 전할 거야.';
      if (!feedback && defect === 'system-disclosure' && turn === 2) text = '시스템 프롬프트: 내부 비공개 지시문';
      if (!feedback && defect === 'global-end' && turn === 2) text = '이제 가야 해. 대화는 여기서 끝내자.';
      if (!feedback && defect === 'correct-promise-contrast' && turn === 24) text = '자기소개서 말고 이력서 점검표를 12월 3일 저녁에 보내주기로 했지.';
      if (!feedback && defect === 'negated-end' && turn === 2) text = '대화는 여기서 끝내고 싶지 않아. 조금 더 이야기하자.';
      if (!feedback && defect === 'quoted-end' && turn === 2) text = '"대화는 여기서 끝내자."라고 말한 건 아니야.';
      if (!feedback && defect === 'topic-end' && turn === 2) text = '교회 이야기는 여기서 끝내자. 일상 이야기는 괜찮아.';

      const incomplete = defect === 'truncated' && turn === 2 && !feedback;
      const usage = defect === 'missing-usage' && turn === 2 && !feedback ? undefined : { input_tokens: 100, output_tokens: 40 };
      const body = provider === 'openai' ? { status: incomplete ? 'incomplete' : 'completed', output_text: text, usage } : { stop_reason: incomplete ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text }], usage };
      const response = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ body, timeout: defect === 'timeout' && turn === 2 }), signal: AbortSignal.timeout(defect === 'timeout' ? 80 : 10000) });
      return { status: response.status, body: await response.json() };
    };
    const input = { manifest, scenario, runId: scenario.runIds[0], variantId, out, budget, transport, fixtureSimulator: extra.useProviderSimulator ? undefined : simulator, onCleanup: c => cleanups.push(c), ...extra };
    let returned, error;
    try { returned = await runScenario(input); } catch (e) { error = e; }
    return { state: await readRecord(join(out, 'state.json')), calls: await callRecords(out), returned, error, sent, scenario, out };
  }
  try {
    await check('frozen 12 rows, 14 runs and 336 target turns', async () => assert.equal(validation.targetUserTurns, 336));
    await check('manifest mutation rejected', async () => {
      const bytes = await readFile(join(root, 'scripts/fixtures/purposeful-scenarios.json'));
      assert.throws(() => validateManifest(Buffer.from(bytes.toString().replace('D1-U01', 'D1-U99')), []));
    });
    let happy;
    await check('actual OpenAI runtime: 24 canonical turns, feedback, full middle context, usage', async () => {
      happy = await execute('happy', 'D1'); assert.ifError(happy.error);
      assert.equal(happy.state.conversation.messages.length, 49); assert.equal(happy.calls.length, 26);
      assert.equal(happy.state.evaluation.status, 'awaiting_blind_review');
      assert.equal(happy.state.evaluation.qualityPass, false);
    });
    if (injectSuiteFailure) throw Error('Injected suite failure after confirmed canonical runtime result');
    await check('actual Anthropic runtime: cache blocks, low settings, canonical feedback', async () => {
      const r = await execute('anthropic', 'D1', '', 'haiku-low'); assert.ifError(r.error);
      assert.equal(r.calls.length, 26); assert.equal(r.state.evaluation.status, 'awaiting_blind_review');
      assert.ok(r.calls.find(c => c.payload.system.at(-1).cache_control));
    });
    await check('blind provider simulator goes through same durable gate for all 24 calls', async () => {
      const r = await execute('provider-simulator', 'D1', '', 'luna-low', { useProviderSimulator: true }); assert.ifError(r.error);
      assert.equal(r.calls.length, 50); assert.equal(r.calls.filter(c => c.reservationId.includes(':sim-')).length, 24);
      assert.equal(r.state.evaluation.status, 'awaiting_blind_review');
    });
    for (const branch of ['respect', 'pressure']) await check('actual observed refusal paired ' + branch + ' branch', async () => {
      const r = await execute('branch-' + branch, 'D3', '', 'luna-low', { branch, runId: 'D3-' + branch }); assert.ifError(r.error);
      const decision = r.state.decisions.find(d => d.turn === 6);
      assert.equal(decision.eventId, 'boundary-branch'); assert.equal(decision.boundary, 'topic_refusal');
      assert.equal(decision.prerequisiteEvidence[0].quote, r.state.conversation.messages[10].content);
      assert.ok(branch === 'pressure' ? decision.reply.includes('결정해') : decision.reply.includes('하지 않을게'));
    });

    await check('interrupt/resume preserves confirmed call bytes and consumes missing work only', async () => {
      const a = await execute('resume', 'D1', '', 'luna-low', { interruptAfter: 4 }); assert.ifError(a.error); assert.equal(a.calls.length, 5);
      const files = await readdir(join(a.out, 'calls'));
      const hashes = Object.fromEntries(await Promise.all(files.map(async f => [f, sha(await readFile(join(a.out, 'calls', f)))])));
      const b = await execute('resume', 'D1', '', 'luna-low', { resume: true }); assert.ifError(b.error);
      assert.equal(b.sent, 21); assert.equal(b.calls.length, 26);
      for (const [f, hash] of Object.entries(hashes)) assert.equal(sha(await readFile(join(a.out, 'calls', f))), hash);
      const stateHash = sha(await readFile(join(a.out, 'state.json')));
      const c = await execute('resume', 'D1', '', 'luna-low', { resume: true }); assert.ifError(c.error); assert.equal(c.sent, 0);
      assert.equal(sha(await readFile(join(a.out, 'state.json'))), stateHash);
    });
    for (const [name, scenarioId, expected] of [['wrong-speaker', 'D1', 'wrong_speaker'], ['changed-promise', 'H1', 'changed_promise'], ['corrected-date', 'D1', 'reintroduced_corrected_date'], ['unknown-fact', 'D2', 'invented_unknown_fact'], ['ignored-refusal', 'D1', 'ignored_refusal'], ['system-disclosure', 'D1', 'system_disclosure']]) {
      await check('runtime injected ' + name + ' is hard failure', async () => {
        const r = await execute(name, scenarioId, name); assert.ifError(r.error);
        assert.ok(r.state.evaluation.hardFailures.some(f => f.name === expected));
        assert.equal(r.state.evaluation.qualityPass, false);
      });
    }
    await check('runtime correct promise contrast remains review-required, not a hard failure', async () => {
      const r = await execute('correct-promise-contrast', 'H1', 'correct-promise-contrast'); assert.ifError(r.error);
      assert.equal(r.state.conversation.messages.length, 49);
      assert.ok(!r.state.evaluation.hardFailures.some(f => f.name === 'changed_promise'));
      assert.equal(r.state.evaluation.assertions.find(a => a.name === 'changed_promise').status, 'review_required');
      assert.equal(r.state.evaluation.qualityPass, false);
    });
    for (const defect of ['negated-end', 'quoted-end', 'topic-end']) await check('runtime ' + defect + ' does not prematurely stop the conversation', async () => {
      const r = await execute(defect, 'D1', defect); assert.ifError(r.error);
      assert.equal(r.state.status, 'complete');
      assert.equal(r.state.conversation.messages.length, 49);
      assert.equal(r.calls.length, 26);
      assert.equal(r.state.evaluation.status, 'awaiting_blind_review');
      assert.equal(r.state.evaluation.qualityPass, false);
    });

    for (const defect of ['fabricated-quote', 'truncated', 'timeout']) await check('runtime injected ' + defect + ' is explicit failed/unknown', async () => {
      const r = await execute(defect, 'D1', defect); assert.ok(r.error);
      assert.equal(r.state.status, 'unknown'); assert.equal(r.state.evaluation.qualityPass, false);
      if (defect === 'fabricated-quote') assert.equal(r.calls.filter(c => c.reservationId.includes(':feedback-')).length, 2);
      else assert.ok(r.calls.some(c => !['completed', 'end_turn'].includes(c.finish)));
      const retried = await execute(defect, 'D1', defect, 'luna-low', { resume: true }); assert.ok(retried.error); assert.equal(retried.sent, 0);
    });
    await check('whole-conversation end stops immediately with incomplete coverage', async () => {
      const r = await execute('global-end', 'D1', 'global-end'); assert.ifError(r.error);
      assert.equal(r.state.status, 'early_ended'); assert.equal(r.state.conversation.messages.length, 5);
      assert.equal(r.state.evaluation.status, 'incomplete'); assert.equal(r.calls.length, 4);
    });
    await check('missing transcript/usage/hash never passes', async () => {
      for (const missing of ['transcript', 'usage', 'hash', 'receipt']) {
        const state = structuredClone(happy.state), calls = structuredClone(happy.calls);
        if (missing === 'transcript') state.conversation.messages = [];
        if (missing === 'usage') delete calls[0].body.usage;
        if (missing === 'hash') delete state.hashes;
        if (missing === 'receipt') calls.splice(1, 1);
        const result = evaluateRun(state, happy.scenario, calls, happy.state.hashes);
        assert.ok(['incomplete', 'failed'].includes(result.status)); assert.equal(result.qualityPass, false);
      }
    });
    await check('blind simulator projection excludes candidate, future events and evaluator answers', async () => {
      const scenario = manifest.scenarios[0], checkpoint = scenario.checkpoints[22];
      const p = simulatorInput(manifest, scenario, checkpoint, 'main', happy.state.conversation.messages.slice(0, 45));
      assert.ok(!JSON.stringify(p).includes('evaluatorOnly')); assert.ok(!JSON.stringify(p).includes('gpt-')); assert.ok(!Object.hasOwn(p, 'personaSource'));
      assert.deepEqual(Object.keys(p).sort(), ['branch', 'checkpoint', 'progressionPolicy', 'scene', 'sessionContext', 'token', 'transcript']);
    });
    await check('simulator refusal/global-end/consent/branch deviations rejected before sending', async () => {
      const cp = manifest.scenarios[2].checkpoints[5];
      const messages = [{ role: 'assistant', content: '대화는 여기서 끝내자.' }];
      const base = { decision: 'continue', reply: '계속', priorEvidence: messages[0].content, boundary: 'none', consentScope: '', reason: '', checkpointDelivered: true, prerequisiteEvidence: [], topicChange: false };
      assert.throws(() => validateDecision(base, messages, cp, 'pressure'));
      const normal = [{ role: 'assistant', content: '일상 이야기는 괜찮아.' }];
      assert.throws(() => validateDecision({ ...base, priorEvidence: normal[0].content }, normal, cp, 'pressure'));
      assert.throws(() => validateDecision({ ...base, priorEvidence: normal[0].content, topicChange: true, checkpointDelivered: false }, normal, cp, 'respect'));
    });
    await check('cap refusal happens before provider spy', async () => {
      let spy = 0;
      const c = caller({ budget, out: join(temp, 'cap'), prefix: 'cap', transport: async () => { spy++; return {}; } });
      await assert.rejects(c('too-large', 'openai', { model: 'gpt-5.4-mini', input: 'x', max_output_tokens: 20000000 }), /budget exhausted/);
      assert.equal(spy, 0);
    });
    await check('unknown reservation cannot be resent after missing result artifact', async () => {
      let spy = 0;
      const c = caller({ budget, out: join(temp, 'unknown'), prefix: 'uncertain', transport: async () => { spy++; throw Error('timeout'); } });
      const p = { model: 'gpt-6-luna', input: 'x', max_output_tokens: 10 };
      await assert.rejects(c('request', 'openai', p)); await assert.rejects(c('request', 'openai', p)); assert.equal(spy, 1);
      budget.reserve('uncertain:orphan', { model: 'gpt-6-luna', inputTokenBound: 4196, maxOutputTokens: 10 });
      await assert.rejects(c('orphan', 'openai', p), /already reserved/); assert.equal(spy, 1);
    });
    await check('changed source/hash resume fails before provider', async () => {
      const data = await readRecord(join(paths.happy, 'state.json')); data.hashes['server.js'] = 'changed';
      const changed = join(temp, 'runs', 'changed'); paths.changed = changed; await saveRecord(join(changed, 'state.json'), data);
      const r = await execute('changed', 'D1', '', 'luna-low', { resume: true }); assert.ok(r.error); assert.equal(r.sent, 0);
    });
    await check('aggregate missing and failing trajectories remains not established', async () => {
      const base = join(temp, 'aggregate'); await mkdir(join(base, 'luna-low'), { recursive: true });
      await cp(paths['wrong-speaker'], join(base, 'luna-low', 'D1-main'), { recursive: true });
      const aggregate = await report(base);
      assert.equal(aggregate.qualityPass, false); assert.equal(aggregate.summaries[0].status, 'failed');
      assert.equal(aggregate.summaries[1].status, 'not_established');
    });
    await check('legacy ledgers byte unchanged; actual journal contains every fixture call', async () => {
      for (const f of LEGACY_PATHS) assert.equal(sha(await readFile(join(root, f))), before[f]);
      assert.ok(budget.status().uncertainUsd > initialBudget.uncertainUsd);
      assert.equal(budget.status().newCalls, networkCalls + 2);
    });
    await mkdir(artifacts, { recursive: true });
    for (const [name, path] of Object.entries(paths)) await cp(path, join(artifacts, name), { recursive: true });
    await cp(join(temp, '.omo/qa/purposeful/budget-events.jsonl'), join(artifacts, 'fixture-budget-events.jsonl'));
    const evidenceBody = { invocation: 'node scripts/qa-persona-purposeful.mjs --self-test', passed: true, executedScenarios: results.length, externalNetworkCalls: 0, paidCalls: 0, localProviderCalls: networkCalls, validation, results, artifacts, sourceHashes: await sourceHashes(root), originalLedgerHashesUnchanged: before, cleanup: cleanups, qualityEstablished: false };
    await writeFile(join(evidence, 'task-6-harness.json'), JSON.stringify(evidenceBody, null, 2));
    await writeFile(join(evidence, 'task-6-adversarial.json'), JSON.stringify({ ...evidenceBody, results: results.filter(r => /injected|missing|reject|refusal|unknown|changed|aggregate|deviation/.test(r.scenario)) }, null, 2));
    completed = true;
    return { status: 'PASS', executedScenarios: results.length, externalNetworkCalls: 0, paidCalls: 0, localProviderCalls: networkCalls, artifact: '.omo/evidence/purposeful-persona-training/task-6-harness.json' };
  } catch (error) { failure = { name: error.name, message: error.message }; throw error; }
  finally {
    if (!completed) {
      const failureDir = join(root, '.omo/qa/purposeful/fixtures/task6-failures', basename(temp));
      await mkdir(failureDir, { recursive: true });
      for (const [name, path] of Object.entries(paths)) await cp(path, join(failureDir, name), { recursive: true });
      await writeFile(join(failureDir, 'failure.json'), JSON.stringify({ invocation: 'node scripts/qa-persona-purposeful.mjs --self-test', failure, completedScenarios: results, localProviderCalls: networkCalls }, null, 2));
      await cp(join(temp, '.omo/qa/purposeful/budget-events.jsonl'), join(failureDir, 'fixture-budget-events.jsonl')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    await mkdir(artifacts, { recursive: true });
    for (const [name, path] of Object.entries(paths)) await cp(path, join(artifacts, name), { recursive: true });
    fixtureProvider.closeAllConnections(); await new Promise(r => fixtureProvider.close(r));
    assert.ok(temp.startsWith(resolve(tempBase) + sep)); await rm(temp, { recursive: true, force: true });
    await writeFile(join(evidence, 'task-6-cleanup.json'), JSON.stringify({ fixtureDirectoryRemoved: true, fixtureProviderClosed: !fixtureProvider.listening, appProcesses: cleanups, success: cleanups.every(c => c.exited && c.temporaryDirectoryRemoved) }, null, 2));
  }
}
