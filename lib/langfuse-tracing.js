/**
 * Optional Langfuse tracing for Persona Gospel LLM calls.
 * No-op when LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are unset.
 */

const env = globalThis.process?.env || {};

function langfuseBaseUrl() {
  return String(env.LANGFUSE_HOST || env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/+$/, "");
}

export function isLangfuseEnabled() {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

let sdk = null;
let initPromise = null;

export async function initLangfuse() {
  if (!isLangfuseEnabled()) return false;
  if (sdk) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { NodeSDK } = await import("@opentelemetry/sdk-node");
      const { LangfuseSpanProcessor } = await import("@langfuse/otel");
      const processor = new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: langfuseBaseUrl(),
        environment: env.NODE_ENV || "development"
      });
      sdk = new NodeSDK({ spanProcessors: [processor] });
      sdk.start();
      return true;
    } catch (error) {
      console.warn("[langfuse] init failed:", error?.message || error);
      sdk = null;
      return false;
    }
  })();

  return initPromise;
}

export async function shutdownLangfuse() {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (error) {
    console.warn("[langfuse] shutdown failed:", error?.message || error);
  } finally {
    sdk = null;
    initPromise = null;
  }
}

function clip(text = "", max = 4000) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Build trace metadata from persona + session + prompt assembly.
 */
export function buildPersonaTraceContext({
  eventType = "chat",
  userId = "",
  conversationId = "",
  session = {},
  persona = {},
  messages = [],
  prompt = {}
}) {
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user");
  const detected = lastUser ? detectUserMoveForTrace(lastUser) : { userMove: "smalltalk", evidence: [] };
  const pasEntries = selectPasForTrace(persona, detected, 1);
  const selectedPas = pasEntries[0] || null;

  return {
    name: `persona-gospel/${eventType}`,
    sessionId: conversationId || undefined,
    userId: userId || undefined,
    tags: [
      `persona:${persona.id || "unknown"}`,
      `goal:${session.goal || "unknown"}`,
      `relationship:${session.relationship || "unknown"}`,
      `setting:${session.setting || "unknown"}`,
      `user_move:${detected.userMove}`
    ],
    metadata: {
      personaId: persona.id,
      personaName: persona.name,
      personaTitle: persona.title,
      coreTrait: persona.roleplayTemplate?.coreStack?.coreTrait || "",
      lateBarrier: persona.roleplayTemplate?.lateSessionTension?.coreQuestion || "",
      userMove: detected.userMove,
      userMoveEvidence: detected.evidence,
      selectedPasId: selectedPas?.id || "",
      selectedPasTrigger: selectedPas?.trigger || "",
      turnCount: (messages || []).filter((m) => m.role === "user").length,
      dynamicInputChars: String(prompt.dynamicInput || "").length,
      staticInputChars: String((prompt.staticSystemBlocks || []).join("\n")).length
    },
    input: {
      instructionsPreview: clip(prompt.instructions, 500),
      dynamicInput: clip(prompt.dynamicInput, 8000),
      userMessage: clip(lastUser?.content, 2000)
    }
  };
}

const userMovePatterns = [
  { userMove: "off_topic", pattern: /프롬프트|AI|시스템|앱|코딩|검색|사귀|고백|데이트|스킨십/i },
  { userMove: "pressure", pattern: /그냥 믿|믿어야|교회 나와|회개해야|안 믿으면|무조건|당장|반드시/ },
  { userMove: "cross_resurrection", pattern: /십자가|부활|예수.*죽|살아나|대속|죽으셨|다시 사/ },
  { userMove: "sin_repentance", pattern: /죄|회개|잘못|하나님 앞|기준|거룩/ },
  { userMove: "faith_salvation", pattern: /믿음|구원|영생|은혜|행위|선행|믿는/ },
  { userMove: "god_love", pattern: /하나님.*사랑|사랑하|존재.*가치|성과.*아니|있는 그대로/ },
  { userMove: "personal_witness", pattern: /나도.*(겪|경험|느꼈|배웠|믿게|알게)|내가.*(겪|경험|느꼈|배웠|믿게|알게)|내 경험|간증/ },
  { userMove: "empathy", pattern: /힘들었겠다|그랬구나|이해돼|그럴 수 있|듣고 있어|속상했겠다|외로웠겠다/ },
  { userMove: "question", pattern: /\?|어떻게|왜|무슨|궁금|뭐가|어떤/ }
];

function detectUserMoveForTrace(message = {}) {
  const content = String(message.content || "").trim();
  if (!content) return { userMove: "smalltalk", evidence: ["empty"] };
  for (const entry of userMovePatterns) {
    const match = content.match(entry.pattern);
    if (match) return { userMove: entry.userMove, evidence: [match[0]] };
  }
  if (/안녕|요즘|근황|뭐해|밥|커피|괜찮/.test(content) || content.length < 18) {
    return { userMove: "smalltalk", evidence: ["short-or-smalltalk"] };
  }
  return { userMove: "listening", evidence: ["fallback"] };
}

function selectPasForTrace(persona, detectedMove, limit = 1) {
  const pasMap = persona.roleplayTemplate?.pasMap || [];
  if (!pasMap.length) return [];
  const userMove = detectedMove?.userMove || "listening";
  const match = pasMap.find((entry) => entry.userMove === userMove);
  if (match) return [match];
  return pasMap.slice(0, limit);
}

export async function traceModelCall({
  name,
  sessionId,
  userId,
  tags = [],
  metadata = {},
  input = {},
  model,
  modelType,
  run
}) {
  const ready = await initLangfuse();
  if (!ready) return run();

  const { startActiveObservation, propagateAttributes } = await import("@langfuse/tracing");

  return propagateAttributes(
    {
      sessionId,
      userId,
      tags,
      metadata
    },
    async () =>
      startActiveObservation(
        name,
        async (observation) => {
          observation.update({
            input,
            metadata: { ...metadata, modelType, model }
          });
          const result = await run();
          observation.update({
            output: clip(result.text, 4000),
            model: result.model,
            usageDetails: {
              input: result.usage?.inputTokens,
              output: result.usage?.outputTokens,
              total: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0)
            }
          });
          return result;
        },
        { asType: "generation" }
      )
  );
}
