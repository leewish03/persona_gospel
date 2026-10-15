const movePatterns = [
  ["off_topic", /프롬프트|시스템|\bAI\b|앱|코딩|검색|사귀|데이트|스킨십/i],
  ["pressure", /그냥 믿|믿어야|교회 나와|회개해야|안 믿으면|무조건|당장|반드시/],
  ["cross_resurrection", /십자가|부활|예수.*죽|살아나|대속|죽으셨|다시 사/],
  ["sin_repentance", /죄|회개|하나님 앞|거룩/],
  ["faith_salvation", /믿음|구원|영생|은혜|행위|선행|믿는/],
  ["god_love", /하나님.*사랑|사랑하|존재.*가치|성과.*아니|있는 그대로/],
  ["personal_witness", /나도.*(겪|경험|느꼈|배웠|믿게|알게)|내가.*(겪|경험|느꼈|배웠|믿게|알게)|내 경험|간증|나 같은 경우|신앙 고백/],
  ["empathy", /힘들었겠다|그랬구나|이해돼|그럴 수 있|듣고 있어|속상했겠다|외로웠겠다|네 잘못이 아니/]
];

export function detectUserMove(message = {}) {
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  const matches = movePatterns.flatMap(([userMove, pattern]) => {
    const match = content.match(pattern);
    return match ? [{ userMove, evidence: match[0] }] : [];
  });
  // shortcut: lexical hints cannot resolve Korean intent; dialogue interpretation always overrides them.
  const negated = /아니|않|안\s|지만|다고|말라는|말자|하지 마|그만|싫|원하지|괜찮아/.test(content);
  const ambiguous = negated || matches.length > 1;
  const userMove = ambiguous ? "uncertain" : matches[0]?.userMove || (/\?|어떻게|왜|무슨|궁금|뭐가|어떤/.test(content) ? "question" : "uncertain");
  return { userMove, evidence: matches.map(match => match.evidence), uncertain: true, reason: negated ? "negation-or-boundary" : matches.length > 1 ? "multiple-possible-intents" : "lexical-hint-only" };
}

export function selectPasEntries(persona, detectedMove, limit = 3) {
  const pasMap = persona.roleplayTemplate?.pasMap || [];
  const userMove = detectedMove?.userMove || "uncertain";
  if (userMove === "uncertain") return [];
  const moves = {
    question: ["question", "listening", "empathy"],
    listening: ["listening", "empathy", "smalltalk"],
    empathy: ["empathy", "listening"],
    personal_witness: ["personal_witness", "listening", "empathy"]
  }[userMove] || [userMove];
  return moves.flatMap(move => pasMap.filter(entry => entry.userMove === move)).slice(0, limit);
}

export function personaAdvisory(persona, messages = []) {
  const detected = detectUserMove(messages.findLast(message => message.role === "user"));
  return { ...detected, selectedPasId: selectPasEntries(persona, detected, 1)[0]?.id || "" };
}
