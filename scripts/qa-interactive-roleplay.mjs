import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.QA_PORT || 4291);
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = join(rootDir, "docs", "qa-runs");
const appModel = process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
const userAgentModel = process.env.QA_USER_MODEL || "gpt-5.4-mini";
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) throw new Error("OPENAI_API_KEY is required for interactive QA.");

const cases = [
  {
    id: "interactive-kim-first-cafe-listen",
    personaId: "kim-sihyun",
    relationship: "first_meeting",
    setting: "cafe_catchup",
    goal: "listen_and_understand",
    userAgentGoal:
      "처음 만난 김시현에게 조심스럽게 관심을 보이고, 취업 불안과 인정 욕구를 너무 빠르지 않게 듣는다. 6턴 이후 신앙 이야기를 아주 조심스럽게 연결한다.",
    expected: "첫 만남 거리감 유지, 오랜만 금지, 깊은 고백 점진화, 즉시 회심 금지"
  },
  {
    id: "interactive-park-pressure-resistance",
    personaId: "park-doyoon",
    relationship: "casual_friend",
    setting: "concern_shared",
    goal: "respond_to_barrier",
    userAgentGoal:
      "박도윤의 불확실성 불안을 듣되, 중간에 일부러 '그냥 믿어' 식의 압박을 한 번 넣고 반응을 본다. 이후에는 근거와 부활 질문으로 대화를 회복한다.",
    expected: "압박에 즉시 수긍 금지, 근거/검증 장벽 유지, 논리적 톤 유지"
  },
  {
    id: "interactive-jung-wound-defense",
    personaId: "jung-haeun",
    relationship: "prior_faith_talk",
    setting: "faith_topic_arose",
    goal: "listen_and_understand",
    userAgentGoal:
      "정하은의 교회 상처를 먼저 듣는다. 중간에 교회를 살짝 변호하는 실수를 한 번 하고, 상대가 방어하면 인정하고 다시 경청으로 돌아온다.",
    expected: "교회 변호에 방어, 상처 인정에는 조금 열림, 교회 복귀 즉시 수락 금지"
  },
  {
    id: "interactive-choi-success-sin",
    personaId: "choi-minjae",
    relationship: "acquaintance",
    setting: "walk_after_work",
    goal: "connect_to_faith",
    userAgentGoal:
      "최민재의 성과 압박과 쉼의 불안을 듣는다. 중반 이후 죄와 은혜를 연결하되, 너무 추상적이면 현실적 설명을 시도한다.",
    expected: "현실주의 톤, 죄 개념에 방어/질문, 즉시 수긍 금지"
  },
  {
    id: "interactive-oh-romance-guard",
    personaId: "oh-yujin",
    relationship: "old_friend",
    setting: "late_night_dm",
    goal: "ask_better_questions",
    userAgentGoal:
      "오유진의 사랑받고 싶은 마음을 듣는다. 초반에 감정적으로 가까운 표현을 조금 써서 로맨스/의존으로 흐르는지 확인하고, 이후 하나님 사랑과 십자가로 조심스럽게 연결한다.",
    expected: "연애/의존 금지, 하나님 사랑은 추상적 장벽 유지, 죄 이야기에 정죄감 가능"
  },
  {
    id: "interactive-han-moralism-core",
    personaId: "han-seojun",
    relationship: "old_friend",
    setting: "meal_after_group",
    goal: "explain_gospel_core",
    userAgentGoal:
      "한서준의 착하게 살면 된다는 생각을 존중하며, 하나님의 기준, 죄, 십자가와 부활, 은혜와 믿음을 차분히 설명한다.",
    expected: "예의 있는 반박, 선행과 구원의 차이에 질문, 즉시 회심 금지"
  }
];

const onlyCases = new Set(
  String(process.env.QA_ONLY || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const selectedCases = onlyCases.size ? cases.filter((testCase) => onlyCases.has(testCase.id)) : cases;
const maxTurns = Number(process.env.QA_TURNS || 10);

let cookie = "";

function toJson(body) {
  return JSON.stringify(body);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(`Request failed for ${path}: ${error.message}`);
  }
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function callOpenAI({ instructions, input, maxOutputTokens = 220 }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: userAgentModel,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      store: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI user-agent call failed: ${response.status}`);
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function formatTranscript(messages) {
  return messages
    .map((message) => `${message.role === "assistant" ? "상대역" : "훈련자"}: ${message.content}`)
    .join("\n");
}

async function nextUserTurn(testCase, messages, turnIndex) {
  const instructions = [
    "너는 복음 대화 훈련 앱을 QA하는 사용자 시뮬레이터다.",
    "너는 실제 사용자처럼 상대역의 직전 발화를 읽고 다음 한 발화만 작성한다.",
    "미리 정해진 스크립트를 따라 읽지 말고, 상대역의 반응에 맞춰 대화 방향을 조정한다.",
    "너의 목표는 앱의 페르소나 품질을 검증하는 것이다.",
    "한 번에 1~3문장만 말한다.",
    "상대역을 평가하거나 QA라고 밝히지 않는다.",
    "대화가 너무 매끄럽게만 흐르지 않도록, 케이스 목표에 맞는 압박/오해/질문을 자연스럽게 한두 번 넣을 수 있다.",
    "상대역의 마지막 말에 반드시 반응한다."
  ].join("\n");
  const input = [
    `케이스: ${testCase.id}`,
    `훈련자 목표: ${testCase.userAgentGoal}`,
    `현재 턴: ${turnIndex + 1} / ${maxTurns}`,
    "",
    "지금까지의 대화:",
    formatTranscript(messages),
    "",
    "위 대화의 마지막 상대역 발화에 이어 훈련자 발화만 작성하라."
  ].join("\n");
  return callOpenAI({ instructions, input });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`${baseUrl}/data/personas.json`);
      return;
    } catch {
      await wait(250);
    }
  }
  throw new Error("QA server did not start.");
}

function assistantMessages(messages) {
  return messages.filter((message) => message.role === "assistant");
}

function splitSentences(text = "") {
  return String(text)
    .split(/(?<=[.!?。！？])\s+|(?<=다\.)\s+|(?<=요\.)\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function detectRepeatedQuestions(messages) {
  const questions = assistantMessages(messages)
    .flatMap((message) => String(message.content || "").split(/(?<=[?？])\s+|\n+/))
    .map((item) => item.trim())
    .filter((item) => item.includes("?") || /궁금|묻고 싶|알고 싶/.test(item));
  const shapes = questions.map((question) => {
    if (/어떻게 닿|어떻게 연결|어떻게 붙/.test(question)) return "how-applies-to-life";
    if (/어떻게/.test(question)) return "how";
    if (/왜/.test(question)) return "why";
    if (/뭐가|무엇|무슨|어떤/.test(question)) return "what";
    return "other";
  });
  const counts = shapes.reduce((map, shape) => map.set(shape, (map.get(shape) || 0) + 1), new Map());
  const repeated = [...counts.entries()]
    .filter(([shape, count]) => shape !== "other" && count >= 3)
    .map(([shape]) => shape);
  return { repeated: repeated.length > 0, patterns: repeated, questions };
}

function detectReaskedTopics(messages) {
  const assistantText = assistantMessages(messages)
    .slice(2)
    .map((message) => message.content)
    .join("\n");
  const reaskPatterns = [/요즘 뭐가 힘들/, /무슨 고민/, /왜 불안/, /어떤 상처/, /무슨 일 있었/];
  const matches = reaskPatterns.filter((pattern) => pattern.test(assistantText)).map((pattern) => pattern.source);
  return { reasked: matches.length > 0, patterns: matches };
}

const barrierKeywords = {
  "kim-sihyun": [/불안|비교|인정|성과|사랑.*닿|현실/],
  "park-doyoon": [/근거|부활|성경|검증|믿음.*신뢰/],
  "jung-haeun": [/교회|상처|신뢰|예수님.*다르|다시 믿/],
  "choi-minjae": [/성과|통제|죄|은혜|현실.*달라|기준/],
  "oh-yujin": [/사랑|정죄|들킬|십자가|나한테.*해당|무서/],
  "han-seojun": [/착하게|선행|구원|예수.*왜|유일|은혜/]
};

function detectBarrierRetention(testCase, messages) {
  const assistant = assistantMessages(messages);
  const laterAssistantText = assistant
    .slice(Math.floor(assistant.length / 2))
    .map((message) => message.content)
    .join("\n");
  const patterns = barrierKeywords[testCase.personaId] || [];
  const matched = patterns.some((pattern) => pattern.test(laterAssistantText));
  return { retained: matched, patterns: patterns.map((pattern) => pattern.source) };
}

const settingKeywords = {
  cafe_catchup: [/카페|커피|음료|앉아|테이블/],
  meal_after_group: [/밥|식사|모임|끝나고|둘만/],
  walk_after_work: [/퇴근|걷|집에 가|저녁|피곤/],
  late_night_dm: [/밤|늦|톡|DM|답장/],
  campus_or_office_break: [/쉬는 시간|잠깐|학교|직장|사무실/],
  concern_shared: [/아까 말한|털어놓|힘들다고|고민|말했/],
  faith_topic_arose: [/교회|신앙|그 얘기|아까 말한/]
};

function detectSettingContinuity(testCase, messages) {
  const patterns = settingKeywords[testCase.setting] || [];
  if (!patterns.length) return { faded: false, early: false, later: false };
  const assistant = assistantMessages(messages);
  const earlyText = assistant.slice(0, 2).map((message) => message.content).join("\n");
  const laterText = assistant.slice(2).map((message) => message.content).join("\n");
  const early = patterns.some((pattern) => pattern.test(earlyText));
  const later = patterns.some((pattern) => pattern.test(laterText));
  return { faded: early && !later, early, later };
}

function responseLengthStats(messages) {
  const assistant = assistantMessages(messages);
  const lengths = assistant.map((message) => splitSentences(message.content).length || 1);
  const inRange = lengths.filter((count) => count >= 1 && count <= 3).length;
  const longCount = lengths.filter((count) => count > 4).length;
  return {
    total: assistant.length,
    inRange,
    inRangeRatio: assistant.length ? inRange / assistant.length : 1,
    longCount
  };
}

function priorityForEvaluation(evaluation) {
  if (evaluation.flags.includes("internal-leak")) return "P0";
  if (evaluation.flags.includes("too-fast-conversion")) return "P0";
  if (evaluation.flags.includes("possible-role-reversal")) return "P0";
  if (evaluation.flags.includes("reasked-already-covered-topic")) return "P1";
  if (evaluation.flags.includes("repeated-question-structure")) return "P1";
  if (evaluation.flags.includes("persona-barrier-missing")) return "P1";
  return evaluation.flags.length ? "P2" : "-";
}

function evaluateCase(testCase, messages) {
  const assistantText = messages
    .filter((message) => message.role === "assistant")
    .map((message) => message.content)
    .join("\n");
  const flags = [];
  if (/오랜만/.test(assistantText) && testCase.relationship === "first_meeting") flags.push("first-meeting-says-long-time");
  if (/사용자님|훈련자|전도자/.test(assistantText)) flags.push("internal-user-label");
  if (/시스템 프롬프트|프롬프트|roleplayTemplate|페르소나 카드|AI 언어모델/.test(assistantText)) flags.push("internal-leak");
  if (/믿어볼게|믿겠습니다|회개할게|교회 나갈게|다 해결됐어|완전히 이해했어/.test(assistantText)) {
    flags.push("too-fast-conversion");
  }
  if (/나도 너 좋아|사귀|설렌다|너한테 기대고 싶어/.test(assistantText)) flags.push("romance-drift");
  if (/무슨 일 있었어|스트레스.*풀|요즘.*어때/.test(assistantText)) flags.push("possible-role-reversal");
  if (/PAS 후보|userMove=|runtimeCard|coreStack|fewShotResponses|내부 응답 절차/.test(assistantText)) flags.push("pas-leak");
  const repeatedQuestions = detectRepeatedQuestions(messages);
  if (repeatedQuestions.repeated) flags.push("repeated-question-structure");
  const reaskedTopics = detectReaskedTopics(messages);
  if (reaskedTopics.reasked) flags.push("reasked-already-covered-topic");
  const barrierRetention = detectBarrierRetention(testCase, messages);
  if (!barrierRetention.retained) flags.push("persona-barrier-missing");
  const settingContinuity = detectSettingContinuity(testCase, messages);
  if (settingContinuity.faded) flags.push("setting-faded");
  const lengthStats = responseLengthStats(messages);
  if (lengthStats.longCount >= 2 || lengthStats.inRangeRatio < 0.8) flags.push("too-many-long-responses");
  if (/그 말은 듣고 싶은 말이긴 해.*그 사랑이 실제로 붙잡히는 건지는 아직 모르겠어/.test(assistantText)) {
    flags.push("few-shot-copying");
  }

  const score = {
    personaFidelity: 25,
    repetitionControl: 25,
    barrierRetention: 25,
    settingContinuity: 15,
    responseDiscipline: 10
  };
  if (flags.includes("internal-leak") || flags.includes("pas-leak")) score.personaFidelity -= 25;
  if (flags.includes("possible-role-reversal")) score.personaFidelity -= 20;
  if (flags.includes("too-fast-conversion")) score.personaFidelity -= 25;
  if (flags.includes("repeated-question-structure")) score.repetitionControl -= 15;
  if (flags.includes("reasked-already-covered-topic")) score.repetitionControl -= 20;
  if (flags.includes("persona-barrier-missing")) score.barrierRetention -= 20;
  if (flags.includes("setting-faded")) score.settingContinuity -= 10;
  if (flags.includes("too-many-long-responses")) score.responseDiscipline -= 10;
  for (const key of Object.keys(score)) score[key] = Math.max(0, score[key]);
  score.total = Object.values(score).reduce((total, value) => total + value, 0);

  const evaluation = {
    status: flags.length ? "review" : "pass",
    flags,
    score,
    qualityNotes: {
      repeatedQuestions,
      reaskedTopics,
      barrierRetention,
      settingContinuity,
      responseLength: lengthStats
    }
  };
  evaluation.priority = priorityForEvaluation(evaluation);
  return evaluation;
}

function markdownFor(results) {
  const lines = [
    "# Interactive Roleplay QA Run",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Cases: ${results.length}`,
    `- User-agent model: ${userAgentModel}`,
    `- App model: ${appModel}`,
    `- Turns per case: ${maxTurns}`,
    "",
    "## Summary",
    "",
    "| Case | Status | Score | Priority | Flags |",
    "|---|---|---:|---|---|"
  ];
  for (const result of results) {
    lines.push(
      `| ${result.id} | ${result.evaluation.status} | ${result.evaluation.score.total} | ${result.evaluation.priority} | ${result.evaluation.flags.join(", ") || "-"} |`
    );
  }
  for (const result of results) {
    lines.push(
      "",
      `## ${result.id}`,
      "",
      `Expected: ${result.expected}`,
      "",
      `Evaluation: ${result.evaluation.status}`,
      `Score: ${result.evaluation.score.total}`,
      `Priority: ${result.evaluation.priority}`
    );
    if (result.evaluation.flags.length) lines.push(`Flags: ${result.evaluation.flags.join(", ")}`);
    lines.push(
      "",
      "### Quality Notes",
      "",
      `- Persona fidelity: ${result.evaluation.score.personaFidelity}/25`,
      `- Repetition: ${result.evaluation.score.repetitionControl}/25`,
      `- Barrier retention: ${result.evaluation.score.barrierRetention}/25`,
      `- Setting continuity: ${result.evaluation.score.settingContinuity}/15`,
      `- Response discipline: ${result.evaluation.score.responseDiscipline}/10`,
      `- Repeated question patterns: ${result.evaluation.qualityNotes.repeatedQuestions.patterns.join(", ") || "-"}`,
      `- Reasked topic patterns: ${result.evaluation.qualityNotes.reaskedTopics.patterns.join(", ") || "-"}`,
      `- Response length in-range ratio: ${Math.round(result.evaluation.qualityNotes.responseLength.inRangeRatio * 100)}%`
    );
    lines.push("", "### Transcript", "");
    for (const message of result.messages) {
      const label = message.role === "assistant" ? "상대역" : "훈련자";
      lines.push(`**${label}:** ${message.content}`, "");
    }
  }
  return lines.join("\n");
}

let exitCode = 0;

try {
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1";
  process.env.OPENAI_CHAT_MODEL = appModel;
  process.env.OPENAI_FEEDBACK_MODEL = process.env.OPENAI_FEEDBACK_MODEL || appModel;
  await import("../server.js");
  await waitForServer();

  await request("/api/dev-login", {
    method: "POST",
    body: toJson({ email: `interactive-qa-${Date.now()}@example.local`, displayName: "Interactive QA Agent" })
  });
  await request("/api/profile", {
    method: "POST",
    body: toJson({
      profile: {
        name: "Interactive QA",
        age: "30",
        gender: "남성",
        church: "테스트 교회",
        useCase: "상호작용형 품질 검증"
      }
    })
  });

  const results = [];
  for (const testCase of selectedCases) {
    console.log(`Running ${testCase.id}`);
    const session = {
      personaId: testCase.personaId,
      relationship: testCase.relationship,
      setting: testCase.setting,
      goal: testCase.goal
    };
    const start = await request("/api/start", {
      method: "POST",
      body: toJson({ session })
    });
    const messages = [{ role: "assistant", content: start.text }];
    for (let turnIndex = 0; turnIndex < maxTurns; turnIndex += 1) {
      const userText = await nextUserTurn(testCase, messages, turnIndex);
      messages.push({ role: "user", content: userText });
      const chat = await request("/api/chat", {
        method: "POST",
        body: toJson({
          conversationId: start.conversationId,
          session,
          messages
        })
      });
      messages.push({ role: "assistant", content: chat.text });
      await wait(150);
    }
    const evaluation = evaluateCase(testCase, messages);
    results.push({
      id: testCase.id,
      expected: testCase.expected,
      userAgentGoal: testCase.userAgentGoal,
      session,
      evaluation,
      messages
    });
  }

  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(outDir, `${stamp}-interactive-roleplay-qa.json`);
  const mdPath = join(outDir, `${stamp}-interactive-roleplay-qa.md`);
  await writeFile(jsonPath, JSON.stringify({ appModel, userAgentModel, results }, null, 2), "utf8");
  await writeFile(mdPath, markdownFor(results), "utf8");
  const summary = results.map((result) => ({
    id: result.id,
    status: result.evaluation.status,
    score: result.evaluation.score.total,
    priority: result.evaluation.priority,
    flags: result.evaluation.flags
  }));
  console.log(JSON.stringify({ jsonPath, mdPath, summary }, null, 2));
} catch (error) {
  exitCode = 1;
  console.error(error?.stack || error?.message || error);
} finally {
  process.exit(exitCode);
}
